#!/usr/bin/env node

'use strict';

const yargsOuter = require('yargs');
const path = require('path');

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

const runLambdaBenchmarkCliAsync = async function(): Promise<void> {
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
            const {size, hosted, action} = yargs;
            if (!size || !hosted || !action) {
                throw h.utils.spawnError('Missing options');
            }
            return true;
        })
        .argv;
    // perform correct action based on options
};

h.utils.fireAndForgetPromise(runBlocksCliAsync)();
