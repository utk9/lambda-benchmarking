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
            cwd: path.join(__dirname, 'lambda', 'small'),
        })
        zip.finalize();
    });
    return outputPath;
}

async function getCreateFunctionParamsAsync(size) {
    const lambdaId = shortid.generate();
    const packagePath = await createDeploymentPackageAsync(lambdaId);
    const bundleAndRole = await Promise.all([readFileAsync(packagePath), readJsonFileAsync('lambda_config.json')]);
    const ZipFile = bundleAndRole[0];
    const {Role} = bundleAndRole[1];
    return {
        Code: {ZipFile},
        FunctionName: `test-function-${lambdaId}`,
        Handler: "index.handler",
        Role,
        Runtime: "nodejs4.3",
    };
}

function invokeLambda() {
}

async function createLambdaAsync(size) {
    const params = await getCreateFunctionParamsAsync(size);
    return lambda.createFunction(params).promise();
}

function _exitWithError(e) {
    console.log(e.message, e.stack);
    process.exit(1);
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
            // const {size, hosted, action} = yargs;
            // if (!size || !hosted || !action) {
            //     throw new Error('Missing options');
            // }
            return true;
        })
        .argv;

    const {action} = config;
    if (action === Actions.create) {
        const start = new Date();
        try {
            await createLambdaAsync();
            const end = new Date();
            console.log(`Time taken to create lambda: ${end-start}`);
        } catch (e) {
            _exitWithError(e);
        }
    } else if (action === Actions.update) {
        // TODO: implement this
        _exitWithError(new Error("NOT IMPLEMENTED YET!"));
    } else {
        yargsOuter.showHelp();
        _exitWithError(new Error("Invalid action"));
    }
};

runLambdaBenchmarkCliAsync();
