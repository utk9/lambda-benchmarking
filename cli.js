#!/usr/bin/env node

'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');

const AWS = require('aws-sdk');
const archiver = require('archiver');
const colors = require('colors');
const jsonfile = require('jsonfile');
const promisify = require('es6-promisify');
const shortid = require('shortid');
const yargsOuter = require('yargs');

const {Timer} = require('./timer');


AWS.config.loadFromPath('./cred.json');
AWS.config.setPromisesDependency(Promise);

const lambda = new AWS.Lambda();
const s3 = new AWS.S3();

const S3_BUCKET = 'airtable-lambda-packages';

const readFileAsync = promisify(fs.readFile);
const readJsonFileAsync = promisify(jsonfile.readFile)

const PackageSizes = {
    small: 'small',
    medium: 'medium',
    large: 'large',
};

const HostedOptions = {
    locally: 'locally',
    s3: 's3',
};

const Actions = {
    create: 'create',
    update: 'update',
};

async function _createDeploymentPackageAsync(lambdaId, size = PackageSizes.medium) {
    const outputPath = path.join(__dirname, 'lambda', 'deployment_packages', `${lambdaId}.zip`)
    const output = fs.createWriteStream(outputPath);
    const zip = archiver('zip');

    await new Promise((resolve, reject) => {
        output.on('close', resolve);
        zip.on('error', reject);
        zip.pipe(output);
        zip.glob('**/*', {
            cwd: path.join(__dirname, 'lambda', size),
        })
        zip.finalize();
    });
    return outputPath;
}

async function _uploadPackageToS3Async(bundle, lambdaId) {
    const params = {
        Bucket: S3_BUCKET,
        Key: `${lambdaId}Bundle`,
        Body: bundle,
    };
    return await s3.upload(params).promise();
}

async function _createLambdaAsync(viaS3 = false, size) {
    const lambdaId = shortid.generate();

    const {Role} = await readJsonFileAsync('lambda_config.json');

    // generate params
    const params = {
        FunctionName: lambdaId,
        Handler: 'index.handler',
        Role,
        Runtime: 'nodejs4.3',
    }

    const timer = new Timer();

    const packagePath = await _createDeploymentPackageAsync(lambdaId, size);
    timer.addCheckpointAndLog('Created deployment package');

    const bundle = await readFileAsync(packagePath);
    timer.addCheckpointAndLog('Read bundle from file system');

    if (viaS3) {
        const {Bucket, Key} = await _uploadPackageToS3Async(bundle, lambdaId);
        timer.addCheckpointAndLog('Uploaded package to S3');
        params.Code = {
            S3Bucket: Bucket,
            S3Key: Key,
        }
    } else {
        params.Code = {
            ZipFile: bundle,
        }
    }
    // upload to lambda
    const result = await lambda.createFunction(params).promise();
    timer.addCheckpointAndLog(`Created Function: ${result.FunctionName}`);
    timer.stop();
    return result;
}

async function _getExisingLambdaAsync() {
    // get any 1 lambda to update (for now)
    const {Functions} = await lambda.listFunctions({MaxItems: 1}).promise();
    if (Functions.length === 0) {
        throw new Error('There are no lambdas to update.');
    }
    return Functions[0];
}

async function _updateLambdaAsync(lambdaToUpdate, viaS3 = false, size) {
    const {FunctionName: lambdaId} = lambdaToUpdate;

    // generate params
    const params = {
        FunctionName: lambdaId,
    }

    const timer = new Timer();

    const packagePath = await _createDeploymentPackageAsync(lambdaId, size);
    timer.addCheckpointAndLog('Created deployment package');

    const bundle = await readFileAsync(packagePath);
    timer.addCheckpointAndLog('Read bundle from file system');

    if (viaS3) {
        const {Bucket, Key} = await _uploadPackageToS3Async(bundle, lambdaId);
        timer.addCheckpointAndLog('Uploaded package to S3');
        params.S3Bucket = Bucket;
        params.S3Key = Key;
    } else {
        params.ZipFile = bundle;
    }
    // update lambda code
    const result = await lambda.updateFunctionCode(params).promise();
    timer.addCheckpointAndLog(`Updated Function: ${result.FunctionName}`);
    timer.stop();
    return result;
}

async function _invokeLambdaAsync(lambdaId) {
    var params = {
        FunctionName: lambdaId,
        InvocationType: "RequestResponse",
    };
    const data = await lambda.invoke(params).promise();
    return data.Payload;
}

function _exitWithError(e) {
    console.log(e.message, e.stack);
    process.exit(1);
}

async function _timeFunctionExecution(message = 'Total execution time', func, ...args) {
    const timer = new Timer();
    const result = await func(...args);
    timer.addCheckpointAndLog(message);
    timer.stop();
    return result;
}

async function _invokeLambdaInSeriesAsync(lambdaId, numInvocations) {
    const range = _.range(numInvocations);
    const timer = new Timer();
    for (const i of range) {
        await _invokeLambdaAsync(lambdaId);
        timer.addCheckpointAndLog(`Invocation ${i}`);
    }
    timer.stop();
}

async function runLambdaBenchmarkCliAsync() {
    const config = yargsOuter
        .usage('Usage: $0 <command> [options] ')
        .option('size', {
            describe: 'Package size',
            choices: _.values(PackageSizes),
        })
        .option('hosted', {
            describe: 'Package hosted locally or on S3',
            choices: _.values(HostedOptions),
        })
        .option('action', {
            describe: 'Crete or update Lambda',
            choices: _.values(Actions),
        })
        .option('invoke', {
            describe: 'Invoke Lambda after creating/updating?',
            type: 'boolean',
        })
        .option('numInvocations', {
            describe: 'Number of times to invoke lambda',
            type: 'number',
            default: 1,
        })
        .help('help')
        .check(yargs => {
            const {hosted, action,  size} = yargs;
            if (!hosted || !action || !size) {
                throw new Error('Missing options');
            }
            return true;
        })
        .argv;

    const {action, hosted, size, invoke, numInvocations} = config;
    if (action === Actions.create) {
        try {
            const result = await _timeFunctionExecution('Total create time', _createLambdaAsync, hosted === HostedOptions.s3, size);
            if (invoke) {
                _invokeLambdaInSeriesAsync(result.FunctionName, numInvocations);
            }
        } catch (e) {
            _exitWithError(e);
        }
    } else if (action === Actions.update) {
        try {
            const lambdaToUpdate = await _getExisingLambdaAsync();
            const result = await _timeFunctionExecution('Total update time', _updateLambdaAsync, lambdaToUpdate, hosted === HostedOptions.s3, size)
            if (invoke) {
                _invokeLambdaInSeriesAsync(result.FunctionName, numInvocations);
            }
        } catch (e) {
            _exitWithError(e);
        }
    } else {
        yargsOuter.showHelp();
        _exitWithError(new Error("Invalid action"));
    }
};

runLambdaBenchmarkCliAsync();
