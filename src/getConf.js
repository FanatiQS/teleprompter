'use strict';

const fs = require('fs');
const path = require('path');

const log = require('./log');
const fsys = require('./fsys');
const isObj = require('./isObj');
const observer = require('./observer');



// Watch config file
function watchConf(confInput, config) {
	// Watch file at path 'confInput'
	config._watcher = fsys.watchJSON(confInput, config);

	// Log, set up config watcher
	log("Watching config file:", /@path/, confInput);
}

// Get config data
function getObj(confInput1) {
	// Get config settings and get 'watcher' for 'config' file
	if (typeof confInput1 === 'string') {
		// Clarify path for console messages
		confInput1 = path.resolve(confInput1);

		// Add file extension if nonexistent
		try {
			confInput1 = fsys.addFileExt(confInput1, '.json');
		}
		// Log, error message if 'confInput1' has the wrong file extension
		catch (err) {
			log.err(err.message);
			throw err;
		}

		try {
			// Get parsed JSON content of config file at path 'confInput1'
			const config = JSON.parse(fs.readFileSync(confInput1, 'utf-8'));

			// Log, completed config setup
			log("Successfully read config file:", /@path/, confInput1);

			// Watch 'config'
			watchConf(confInput1, config);

			// Return config object
			return config;
		}
		catch (err) {
			// Create new config file if it was not found
			if (err.code === 'ENOENT') {
				// Log, creating new file, it does not exist
				log.err("Unable to locate config file. Creating a new one:", /@path/, confInput1);

				// Create new config object
				const config = {_createFileCallback: null};

				// Create a new file and entire path asynchronously
				fsys.createFile(confInput1, '{\n\t\n}', (err) => {
					// Get '_createFileCallback' callback function
					const callback = config._createFileCallback;

					// Delete '_createFileCallback' for cleaner look in callback response
					delete config._createFileCallback;

					// Fire 'callback' if it exists and return
					if (callback) {
						callback(err, confInput1);
						if (err) return;
					}

					// Log and throw error if no error catcher function exists
					if (err) {
						log.err("Failed to create config file at:", /@path/, confInput1);
						throw err;
					}

					// Log, created new file
					log("Created new config file at:", /@path/, confInput1);

					// Watch 'config'
					watchConf(confInput1, config);
				});

				// Return config object
				return config;
			}
			// Error handling for errors other than if file is not found
			else {
				log.err((err.message.match(/JSON/)) ? "Error parsing config file:" : "Error getting config file:", confInput1);
				throw err;
			}
		}
	}
	// Return input object
	else if (isObj(confInput1)) {
		return confInput1;
	}
	// Error handling for unsupported argument types
	else {
		const err = TypeError("Unable to setup config, 'confInput1' needs to be an object or a string path to a JSON file");
		log.err(err.message);
		throw err;
	}
}

// Get config object, create middlewares and links
module.exports = function (confInput1, confInput2, observers) {
	// Log, getting config settings
	log("\nSetting up config settings...");

	// Set 'confInput1' to './config.json' if it is left undefined
	if (!confInput1) confInput1 = './config.json';

	// Get conf data
	const conf = getObj(confInput1);

	// Set up observer for every property in 'observers' on 'conf' and fire observers callback on change
	Object.keys(observers).forEach((key) => {
		const value = observers[key];

		// Error handling for if property is not a function
		if (typeof value !== 'function') throw Error("Observer callback for '" + key + "' has to be a function: " + value);

		// Add observer to 'conf' property 'key'
		observer(conf, key, value);
	});

	// Add links to all 'confInput2' properties in 'conf'
	if (confInput2) {
		const locked = Object.keys(confInput2);
		locked.forEach((key) => {
			// Log, error message for if 'conf' already has the property
			if (conf.propertyIsEnumerable(key)) log.err("Unable to use '" + key + "' from config, property is locked");

			// Update 'confInput2' property if 'conf' has setter middleware
			const mid = ((Object.getOwnPropertyDescriptor(conf, key) || {}).set || {}).mid;
			if (mid) {
				// Get property descriptor of 'confInput2'
				const conf2Prop = Object.getOwnPropertyDescriptor(confInput2, key);

				// Create getter/setter if value is used
				if (conf2Prop.value) {
					conf2Prop.get = function () {
						return conf2Prop.value;
					};
					conf2Prop.set = function (value) {
						conf2Prop.value = value;
					};
				}

				// Set up getter/setter on 'confInput2'
				Object.defineProperty(confInput2, key, {
					get: conf2Prop.get,
					set: (!conf2Prop.set) ? undefined : function (value) {
						mid(value, this[key]);
						conf2Prop.set(value);
					}
				});
			}

			// Create link to 'confInput2' property in 'conf'
			Object.defineProperty(conf, key, {
				get: function () {
					return confInput2[key];
				},
				set: function () {
					log.err("Unable to update '" + key + "' in config, property is locked");//!!## try to find another way of preventing crahses
				},
				enumerable: true,
				configurable: false
			});
		});

		// Log, locked properties list
		log("Locked properties in config:\n\t" + locked.join('\n\t'));
	}

	// Log, finnished setting up config with content of 'conf' unless it is empty
	const confKeys = Object.keys(conf);
	log("Completed config setup" + (!confKeys.length ? '' : " with settings:" + confKeys.map((key) => (key[0] === '_') ? null : '\n\t' + key + ': ' + conf[key]).join('')));

	// Return 'conf' object
	return conf;
};
