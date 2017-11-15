defaultContracts = ["0x007ccffb7916f37f7aeef05e8096ecfbe55afc2f",
    "0x99429f64cf4d5837620dcc293c1a537d58729b68",
    "0xca247d7425a29c6645fa991f9151f994a830882d",
    "0x794f74c8916310d6a0009bb8a43a5acab59a58ad",
    "0x276ecb88715a503b00d1f15af4c17dc051991667",
    "0x83042c0147acce98e35ed9ef52e6dfc5c67ef92e",
    "0x8ab7114ba0f7ca706af69f799588766c8426aa24",
    "0x932d9e95e5d2cac02eebbe6763ab2c7b0a9d6a2f",
    "0x893c3f80d2a0375b3f00f856cf8a6775e4efc26a",
    "0xb1d3073bcc45462a3b0dfe69902cdd12971efec9"];

web3.personal.listAccounts.forEach(function (acc) {
    if (defaultContracts.indexOf(acc) > -1) {
        web3.personal.unlockAccount(acc, "", 0);
        console.log("account " + acc + " unlocked")
    }
});

// Adapted from Iuri Matias' Embark framework
// https://github.com/iurimatias/embark-framework
// Modified by ryepdx to mine at regular intervals.
(function () {
    var main = function () {
        /* TODO: Find a way to load mining config from YML.

        if (!loadScript("config.js")) {
          console.log("== config.js not found");
        }

        if (typeof(config) === "undefined") {
          config = {};
          console.log("== config is undefined, proceeding with defaults");
        }

        In the meantime, just set an empty config object.
        */
        config = {};
        transactions = {};

        defaults = {
            interval_ms: 300000,
            initial_ether: 15000000000000000000,
            mine_pending_txns: true,
            mine_periodically: false,
            mine_normally: false,
            threads: 1
        };

        for (var key in defaults) {
            if (config[key] === undefined) {
                config[key] = defaults[key];
            }
        }

        var miner_obj = (admin.miner === undefined) ? miner : admin.miner;

        if (config.mine_normally) {
            miner_obj.start(config.threads);
            // miner_obj.start();
            return;
        }

        // TODO: check why it's no longer accepting this param
        //miner_obj.stop(config.threads);
        miner_obj.stop();

        fundAccount(config, miner_obj, function () {
            if (config.mine_periodically) start_periodic_mining(config, miner_obj);
            if (config.mine_pending_txns) start_transaction_mining(config, miner_obj);
        });
    };

    var fundAccount = function (config, miner_obj, cb) {
        var accountFunded = function () {
            return (eth.getBalance(eth.coinbase) >= config.initial_ether);
        };

        if (accountFunded()) {
            return cb();
        }

        console.log("== Funding account");
        miner_obj.start();

        var blockWatcher = web3.eth.filter("latest").watch(function () {
            if (accountFunded()) {
                console.log("== Account funded");

                blockWatcher.stopWatching();
                //miner_obj.stop(config.threads);
                miner_obj.stop();
                cb();
            }
        });
    };

    var pendingTransactions = function () {
        console.log("== Not confirmed transactions = " + Object.keys(transactions).length);
        if (web3.eth.pendingTransactions === undefined || web3.eth.pendingTransactions === null) {
            return txpool.status.pending || txpool.status.queued;
        }
        else if (typeof web3.eth.pendingTransactions === "function") {
            return web3.eth.pendingTransactions().length > 0;
        }
        else if (Object.keys(transactions).length > 0) {
            Object.keys(transactions).forEach(function (t) {
                var confirmations = web3.eth.blockNumber - web3.eth.getTransaction(t).blockNumber;
                console.log("== Confirmations for transaction [" + t + "] = " + confirmations);
                if (confirmations > 11) {
                    delete transactions[t];
                    console.log("== Remove transaction [" + t + "] from list");
                }
            });
            return true;
        }
        else {
            return web3.eth.pendingTransactions.length > 0 || web3.eth.getBlock('pending').transactions.length > 0;
        }
    };

    var start_periodic_mining = function (config, miner_obj) {
        var last_mined_ms = Date.now();
        var timeout_set = false;

        miner_obj.start(config.threads);
        // miner_obj.start();
        web3.eth.filter("latest").watch(function () {
            if ((config.mine_pending_txns && pendingTransactions()) || timeout_set) {
                return;
            }

            timeout_set = true;

            var now = Date.now();
            var ms_since_block = now - last_mined_ms;
            last_mined_ms = now;

            var next_block_in_ms;

            if (ms_since_block > config.interval_ms) {
                next_block_in_ms = 0;
            } else {
                next_block_in_ms = (config.interval_ms - ms_since_block);
            }

            //miner_obj.stop(config.threads);
            miner_obj.stop();
            console.log("== Looking for next block in " + next_block_in_ms + "ms");

            setTimeout(function () {
                console.log("== Looking for next block");
                timeout_set = false;
                miner_obj.start(config.threads);
                // miner_obj.start();
            }, next_block_in_ms);
        });
    };

    var start_transaction_mining = function (config, miner_obj) {
        web3.eth.filter("pending").watch(function () {

            var ptransactions = web3.eth.getBlock('pending').transactions;
            ptransactions.forEach(function (pt) {
                transactions[pt] = pt;
                console.log("== Added transaction " + pt);
                console.log("== Transactions size =" + Object.keys(transactions).length);
            });

            if (miner_obj.hashrate > 0) return;

            console.log("== Pending transactions! Looking for next block...");
            miner_obj.start(config.threads);
            // miner_obj.start();
        });

        if (config.mine_periodically) return;

        web3.eth.filter("latest").watch(function () {
            if (!pendingTransactions()) {
                console.log("== No transactions left. Stopping miner...");
                //miner_obj.stop(config.threads);
                miner_obj.stop();
            }
        });
    };
    main();
})();