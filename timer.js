const colors = require('colors');

class Timer {
    constructor() {
        this._checkpoints = [process.hrtime()];
    }

    get _latestCheckpointIdx() {
        return this._checkpoints.length - 1;
    }

    addCheckpointAndLog(message) {
        if (Object.isFrozen(this)) {
            throw new Error('This timer has been stopped already.');
        }
        const timeSinceLastCheckpoint = process.hrtime(this._checkpoints[this._latestCheckpointIdx]);
        console.log(message + ' -- ' + '%ds %dms'.green, timeSinceLastCheckpoint[0], timeSinceLastCheckpoint[1]/1000000);
        this._checkpoints.push(process.hrtime());
    }

    stop() {
        Object.freeze(this);
    }
}

exports.Timer = Timer;
