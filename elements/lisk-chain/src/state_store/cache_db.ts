/*
 * Copyright © 2021 Lisk Foundation
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

import { StateDiff } from '../types';
import { copyBuffer } from './utils';
import { DatabaseWriter } from './types';

interface CacheValue {
	init?: Buffer;
	value: Buffer;
	dirty: boolean;
	deleted: boolean;
}

interface GetResult {
	value?: Buffer;
	deleted: boolean;
}

const copyCacheValue = (value: CacheValue): CacheValue => {
	const copiedValue = copyBuffer(value.value);

	let copiedInit: Buffer | undefined;
	if (value.init) {
		copiedInit = copyBuffer(value.init);
	}
	return {
		init: copiedInit,
		value: copiedValue,
		dirty: value.dirty,
		deleted: value.deleted,
	};
};

export class CacheDB {
	private readonly _data: Record<string, CacheValue>;

	public constructor() {
		this._data = {};
	}

	// add to cache where the key does not exist in persisted data
	public add(key: Buffer, value: Buffer): void {
		const strKey = key.toString('binary');
		this._data[strKey] = {
			value,
			deleted: false,
			dirty: false,
		};
	}

	// cache key,value which already existed in persited data
	public cache(key: Buffer, value: Buffer): void {
		const strKey = key.toString('binary');
		const copiedValue = copyBuffer(value);
		this._data[strKey] = {
			init: copiedValue,
			value,
			deleted: false,
			dirty: false,
		};
	}

	public set(key: Buffer, value: Buffer): void {
		const strKey = key.toString('binary');
		const existing = this._data[strKey];
		if (!existing) {
			throw new Error('Key must exist in the cache before calling set');
		}
		existing.dirty = true;
		existing.deleted = false;
		existing.value = value;
	}

	public get(key: Buffer): GetResult {
		const strKey = key.toString('binary');
		const existing = this._data[strKey];
		if (!existing) {
			return {
				value: undefined,
				deleted: false,
			};
		}
		if (existing.deleted) {
			return {
				value: undefined,
				deleted: true,
			};
		}
		return {
			value: existing.value,
			deleted: false,
		};
	}

	public del(key: Buffer): void {
		const strKey = key.toString('binary');
		const existing = this._data[strKey];
		if (!existing) {
			return;
		}
		if (existing.init === undefined) {
			delete this._data[strKey];
			return;
		}
		existing.deleted = true;
	}

	public existAny(key: Buffer): boolean {
		const strKey = key.toString('binary');
		const existing = this._data[strKey];
		return existing !== undefined;
	}

	public exist(key: Buffer): boolean {
		const strKey = key.toString('binary');
		const existing = this._data[strKey];
		if (!existing) {
			return false;
		}
		if (existing.deleted) {
			return false;
		}
		return true;
	}

	public getRange(start: Buffer, end: Buffer): { key: Buffer; value: Buffer }[] {
		const result = [];
		for (const [strKey, value] of Object.entries(this._data)) {
			const key = Buffer.from(strKey, 'binary');
			if (key.compare(start) >= 0 && key.compare(end) <= 0 && !value.deleted) {
				result.push({
					key,
					value: value.value,
				});
			}
		}
		return result;
	}

	public copy(): CacheDB {
		const newDB = new CacheDB();
		for (const key of Object.keys(this._data)) {
			newDB._data[key] = copyCacheValue(this._data[key]);
		}
		return newDB;
	}

	public finalize(batch: DatabaseWriter): StateDiff {
		const diff: StateDiff = {
			created: [],
			deleted: [],
			updated: [],
		};
		for (const [key, value] of Object.entries(this._data)) {
			const keyBytes = Buffer.from(key, 'binary');
			if (value.init === undefined) {
				diff.created.push(keyBytes);
				batch.put(keyBytes, value.value);
				continue;
			}
			if (value.deleted) {
				diff.deleted.push({
					key: keyBytes,
					value: value.init,
				});
				batch.del(keyBytes);
				continue;
			}
			if (value.dirty) {
				diff.updated.push({
					key: keyBytes,
					value: value.init,
				});
				batch.put(keyBytes, value.value);
			}
		}
		return diff;
	}
}
