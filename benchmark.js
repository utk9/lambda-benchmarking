#!/usr/bin/env node

const _ = require('lodash');
const colors = require('colors');

const {runLambdaBenchmarkAsync, PackageSizes, HostedOptions, Actions} = require('./runner.js');

async function benchmark() {
    for (const size of _.values(PackageSizes)) {
        for (const hosted of _.values(HostedOptions)) {
            for (const action of _.values(Actions)) {
                const times = [];
                for (let i=0; i<5; i++){ // do 5 times
                    const result = await runLambdaBenchmarkAsync({action, hosted, size}); // no invocation
                    times.push(result);
                }
                console.log(`Args: ${action}, ${hosted}, ${size}`.bold);
                const avg = _.meanBy(times, time => (time[0]*1000+time[1]/1000000));
                console.log(`Avg time: ${avg}ms`.bold);
                console.log('----------------------------------------------------'.bold)

            }
        }
    }
}

benchmark();
