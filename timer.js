const colors = require('colors');

class Timer {
    constructor() {
        this._checkpoints = [process.hrtime()];
        this._checkpointTimes = [[0, 0]];
    }

    get _latestCheckpointIdx() {
        return this._checkpoints.length - 1;
    }

    get _latestCheckpointTime() {
        return this._checkpointTimes[this._latestCheckpointIdx];
    }

    addCheckpointAndLog(message) {
        if (Object.isFrozen(this)) {
            throw new Error('This timer has been stopped already.');
        }

        const timeSinceLastCheckpoint = process.hrtime(this._checkpoints[this._latestCheckpointIdx]);

        this._checkpoints.push(process.hrtime());
        this._checkpointTimes.push(timeSinceLastCheckpoint);

        console.log(message + ' -- ' + '%ds %dms'.green, timeSinceLastCheckpoint[0], timeSinceLastCheckpoint[1]/1000000);
    }

    stop() {
        Object.freeze(this);
    }
}

module.exports = Timer;
