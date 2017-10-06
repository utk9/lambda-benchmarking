#!/usr/bin/env node

'use strict';

const _ = require('lodash');

const yargsOuter = require('yargs');

const Timer = require('./timer');
const {runLambdaBenchmarkAsync, PackageSizes, HostedOptions, Actions} = require('./runner.js');

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
    runLambdaBenchmarkAsync(config);
};

module.exports = runLambdaBenchmarkAsync;

runLambdaBenchmarkCliAsync();
