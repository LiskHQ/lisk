/*
 * Copyright © 2020 Lisk Foundation
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
 */
import { debug } from 'debug';
import levelup, { LevelUp } from 'levelup';
import { MemDown } from 'memdown';
import { NotFoundError } from './errors';
import { Options, BatchChain, ReadStreamOptions } from './types';

// eslint-disable-next-line
const memdown = require('memdown');

const logger = debug('db');

export class InMemoryKVStore {
	private readonly _db: LevelUp<MemDown<Buffer, Buffer>>;

	public constructor() {
		// eslint-disable-next-line
		this._db = levelup(memdown());
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	public async close(): Promise<void> {}

	public async get(key: Buffer): Promise<Buffer> {
		logger('get', { key });
		try {
			const result = await this._db.get(key);
			return result;
		} catch (error) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			if (error.notFound) {
				throw new NotFoundError(key.toString('hex'));
			}
			throw error;
		}
	}

	public async exists(key: Buffer): Promise<boolean> {
		try {
			logger('exists', { key });
			await this._db.get(key);

			return true;
		} catch (error) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			if (error.notFound) {
				return false;
			}
			throw error;
		}
	}

	public async clear(options?: Options): Promise<void> {
		await this._db.clear(options);
	}

	public async put(key: Buffer, val: Buffer): Promise<void> {
		logger('put', { key });

		await this._db.put(key, val);
	}

	public async del(key: Buffer): Promise<void> {
		logger('del', { key });

		await this._db.del(key);
	}

	public createReadStream(options?: ReadStreamOptions): NodeJS.ReadableStream {
		logger('readStream', { options });
		return this._db.createReadStream({ ...options, keyAsBuffer: true });
	}

	public batch(): BatchChain {
		return this._db.batch();
	}
}
