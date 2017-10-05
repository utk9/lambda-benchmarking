#!/usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs');
const _ = require('lodash');

const archiver = require('archiver');
const yargsOuter = require('yargs');
const promisify = require('es6-promisify');
const shortid = require('shortid');
const jsonfile = require('jsonfile');
const AWS = require('aws-sdk');

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

async function createDeploymentPackageAsync(lambdaId) {
    const outputPath = path.join(__dirname, 'lambda', 'deployment_packages', `${lambdaId}.zip`)
    const output = fs.createWriteStream(outputPath);
    const zip = archiver('zip');

    await new Promise((resolve, reject) => {
        output.on('close', resolve);
        zip.on('error', reject);
        zip.pipe(output);
        zip.glob('*', {
            cwd: path.join(__dirname, 'lambda', 'medium'),
        })
        zip.finalize();
    });
    return outputPath;
}

async function _uploadPackageToS3Async(lambdaId) {
    const packagePath = await createDeploymentPackageAsync(lambdaId);
    const bundle = await readFileAsync(packagePath);
    const params = {
        Bucket: S3_BUCKET,
        Key: `${lambdaId}Bundle`,
        Body: bundle,
    };
    const data = await s3.upload(params).promise();
    return data;
}

async function _createLambdaAsync(viaS3 = false) {
    const lambdaId = shortid.generate();

    const {Role} = await readJsonFileAsync('lambda_config.json');

    // generate params
    const params = {
        FunctionName: lambdaId,
        Handler: 'index.handler',
        Role,
        Runtime: 'nodejs4.3',
    }
    if (viaS3) {
        const {Bucket, Key} = await _uploadPackageToS3Async(lambdaId);
        params.Code = {
            S3Bucket: Bucket,
            S3Key: Key,
        }
    } else {
        const packagePath = await createDeploymentPackageAsync(lambdaId);
        const bundle = await readFileAsync(packagePath);
        params.Code = {
            ZipFile: bundle,
        }
    }
    // upload to lambda
    return await lambda.createFunction(params).promise();
}

async function _getExisingLambdaAsync() {
    // get any 1 lambda to update (for now)
    const {Functions} = await lambda.listFunctions({MaxItems: 1}).promise();
    if (Functions.length === 0) {
        throw new Error('There are no lambdas to update.');
    }
    return Functions[0];
}

async function _updateLambdaAsync(lambdaToUpdate, viaS3 = false) {
    const {FunctionName: lambdaId} = lambdaToUpdate;

    // generate params
    const params = {
        FunctionName: lambdaId,
    }
    if (viaS3) {
        const {Bucket, Key} = await _uploadPackageToS3Async(lambdaId);
        params.S3Bucket = Bucket;
        params.S3Key = Key;
    } else {
        const packagePath = await createDeploymentPackageAsync(lambdaId);
        const bundle = await readFileAsync(packagePath);
        params.ZipFile = bundle;
    }
    // update lambda code
    return lambda.updateFunctionCode(params).promise();
}

function _exitWithError(e) {
    console.log(e.message, e.stack);
    process.exit(1);
}

async function _timeFunctionExecution(func, ...args) {
    const hrstart = process.hrtime();
    const result = await func(...args);
    return {
        result: result,
        timeTaken: process.hrtime(hrstart),
    }
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
        .help('help')
        .check(yargs => {
            const {hosted, action} = yargs;
            if (!hosted || !action) {
                throw new Error('Missing options');
            }
            return true;
        })
        .argv;

    const {action, hosted} = config;
    if (action === Actions.create) {
        try {
            const {result, timeTaken} = await _timeFunctionExecution(_createLambdaAsync, hosted === HostedOptions.s3);
            console.log(`Lambda created: ${result.FunctionName}`);
            console.info("Execution time: %ds %dms", timeTaken[0], timeTaken[1]/1000000);
        } catch (e) {
            _exitWithError(e);
        }
    } else if (action === Actions.update) {
        try {
            const lambdaToUpdate = await _getExisingLambdaAsync();
            const {result, timeTaken} = await _timeFunctionExecution(_updateLambdaAsync, lambdaToUpdate, hosted === HostedOptions.s3)
            console.log(`Lambda updated: ${result.FunctionName}`);
            console.info("Execution time: %ds %dms", timeTaken[0], timeTaken[1]/1000000);
        } catch (e) {
            _exitWithError(e);
        }
    } else {
        yargsOuter.showHelp();
        _exitWithError(new Error("Invalid action"));
    }
};

runLambdaBenchmarkCliAsync();
