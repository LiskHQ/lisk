/*
 * LiskHQ/lisky
 * Copyright © 2017 Lisk Foundation
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Unless otherwise agreed in a custom licensing agreement with the Lisk Foundation,
 * no part of this software, including this file, may be copied, modified,
 * propagated, or distributed except according to the terms contained in the
 * LICENSE file.
 *
 * Removal or modification of this copyright notice is prohibited.
 *
 */
import readline from 'readline';
import fse from 'fs-extra';

export const ERROR_PASSPHRASE_VERIFICATION_FAIL = 'Passphrase verification failed.';
const ERROR_PASSPHRASE_SOURCE_TYPE_UNKNOWN = 'Unknown passphrase source type. Must be one of `env`, `file`, or `stdin`. Leave blank for prompt.';
const ERROR_PASSPHRASE_ENV_VARIABLE_NOT_SET = 'Passphrase environmental variable not set.';
const ERROR_FILE_DOES_NOT_EXIST = 'File does not exist.';
const ERROR_FILE_UNREADABLE = 'File could not be read.';
const ERROR_DATA_MISSING = 'No data was provided.';
const ERROR_DATA_SOURCE_TYPE_UNKNOWN = 'Unknown data source type. Must be one of `file`, or `stdin`.';

export const splitSource = (source) => {
	const delimiter = ':';
	const sourceParts = source.split(delimiter);
	return {
		sourceType: sourceParts[0],
		sourceIdentifier: sourceParts.slice(1).join(delimiter),
	};
};

export const getStdIn = ({ dataIsRequired, passphraseIsRequired } = {}) =>
	new Promise((resolve) => {
		if (!dataIsRequired && !passphraseIsRequired) return resolve({});

		const lines = [];
		const rl = readline.createInterface({ input: process.stdin });

		const handleLine = line => (
			dataIsRequired
				? lines.push(line)
				: resolve({ passphrase: line }) || rl.close()
		);
		const handleClose = () => {
			const dataLines = passphraseIsRequired ? lines.slice(1) : lines;
			return resolve({
				data: dataLines.join('\n'),
				passphrase: passphraseIsRequired ? lines[0] : null,
			});
		};

		return rl
			.on('line', handleLine)
			.on('close', handleClose);
	});

export const createPromptOptions = message => ({
	type: 'password',
	name: 'passphrase',
	message,
});

export const getPassphraseFromPrompt = (vorpal, displayName = 'your secret passphrase') => {
	// IMPORTANT: prompt will exit if UI has no parent, but calling
	// ui.attach(vorpal) will start a prompt, which will complain when we call
	// vorpal.activeCommand.prompt(). Therefore set the parent directly.
	if (!vorpal.ui.parent) {
		// eslint-disable-next-line no-param-reassign
		vorpal.ui.parent = vorpal;
	}
	return vorpal.activeCommand.prompt(createPromptOptions(`Please enter ${displayName}: `))
		.then(({ passphrase }) => vorpal.activeCommand.prompt(createPromptOptions(`Please re-enter ${displayName}: `))
			.then(({ passphrase: passphraseRepeat }) => {
				if (passphrase !== passphraseRepeat) {
					throw new Error(ERROR_PASSPHRASE_VERIFICATION_FAIL);
				}
				return passphrase;
			}),
		);
};

export const getPassphraseFromEnvVariable = async (key) => {
	const passphrase = process.env[key];
	if (!passphrase) {
		throw new Error(ERROR_PASSPHRASE_ENV_VARIABLE_NOT_SET);
	}
	return passphrase;
};


export const getPassphraseFromFile = path => new Promise((resolve, reject) => {
	const stream = fse.createReadStream(path);
	const handleReadError = (error) => {
		stream.close();
		const { message } = error;

		if (message.match(/ENOENT/)) {
			return reject(new Error(ERROR_FILE_DOES_NOT_EXIST));
		}
		if (message.match(/EACCES/)) {
			return reject(new Error(ERROR_FILE_UNREADABLE));
		}

		return reject(error);
	};
	const handleLine = (line) => {
		stream.close();
		resolve(line);
	};

	stream.on('error', handleReadError);

	readline.createInterface({ input: stream })
		.on('error', handleReadError)
		.on('line', handleLine);
});

export const getPassphraseFromSource = async (source) => {
	const { sourceType, sourceIdentifier } = splitSource(source);

	switch (sourceType) {
	case 'env':
		return getPassphraseFromEnvVariable(sourceIdentifier);
	case 'file':
		return getPassphraseFromFile(sourceIdentifier);
	case 'pass':
		return sourceIdentifier;
	default:
		throw new Error(ERROR_PASSPHRASE_SOURCE_TYPE_UNKNOWN);
	}
};

export const getPassphrase = async (vorpal, passphraseSource, { passphrase } = {}, displayName) => {
	if (passphrase) return passphrase;
	if (!passphraseSource) return getPassphraseFromPrompt(vorpal, displayName);
	return getPassphraseFromSource(passphraseSource);
};

export const getDataFromFile = async path => fse.readFileSync(path, 'utf8');

export const getData = async (arg, source, { data } = {}) => {
	if (arg) return arg;
	if (typeof data === 'string') return data;
	if (!source) {
		throw new Error(ERROR_DATA_MISSING);
	}

	const { sourceType, sourceIdentifier } = splitSource(source);

	if (sourceType !== 'file') {
		throw new Error(ERROR_DATA_SOURCE_TYPE_UNKNOWN);
	}

	return getDataFromFile(sourceIdentifier)
		.catch((error) => {
			const { message } = error;
			if (message.match(/ENOENT/)) {
				throw new Error(ERROR_FILE_DOES_NOT_EXIST);
			}
			if (message.match(/EACCES/)) {
				throw new Error(ERROR_FILE_UNREADABLE);
			}
			throw error;
		});
};
