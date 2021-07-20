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
import { codec } from '@liskhq/lisk-codec';
import { getRandomBytes } from '@liskhq/lisk-cryptography';
import { InMemoryKVStore } from '@liskhq/lisk-db';
import { NotFoundError, StateStore } from '../../../src/state_store';
import { DatabaseWriter } from '../../../src/state_store/types';

const sampleSchema = {
	$id: 'object9',
	type: 'object',
	properties: {
		address: {
			dataType: 'bytes',
			fieldNumber: 1,
		},
	},
};

describe('state store', () => {
	const moduleID = 2;
	const storePrefix = 0;
	const existingKey = getRandomBytes(20);
	const existingKey2 = getRandomBytes(20);
	const existingValue = getRandomBytes(64);
	const existingValue2 = getRandomBytes(64);

	let stateStore: StateStore;
	let db: InMemoryKVStore;

	beforeEach(async () => {
		db = new InMemoryKVStore();
		stateStore = new StateStore(db);
		const moduleIDBuffer = Buffer.alloc(4);
		moduleIDBuffer.writeInt32BE(moduleID, 0);
		const storePrefixBuffer = Buffer.alloc(2);
		storePrefixBuffer.writeUInt16BE(storePrefix, 0);
		await db.put(
			Buffer.concat([stateStore['_prefix'], moduleIDBuffer, storePrefixBuffer, existingKey]),
			existingValue,
		);
		await db.put(
			Buffer.concat([stateStore['_prefix'], moduleIDBuffer, storePrefixBuffer, existingKey2]),
			existingValue2,
		);
	});

	describe('getStore', () => {
		it('should keep the same cache as the original state store', async () => {
			const address = getRandomBytes(20);
			const value = getRandomBytes(64);
			const subStore = stateStore.getStore(2, 0);
			await subStore.set(address, value);
			// create different store from the state store
			const newSubStore = stateStore.getStore(2, 0);
			const valueFromNewStore = await newSubStore.get(address);

			expect(valueFromNewStore).toEqual(value);
		});

		it('should append the prefix', () => {
			const subStore = stateStore.getStore(2, 0);
			// db prefix(1) + moduleID(4) + storePrefix(2)
			expect(subStore['_prefix']).toHaveLength(1 + 4 + 2);
		});
	});

	describe('get', () => {
		it('should get from the cache if the key already exist', async () => {
			const subStore = stateStore.getStore(moduleID, storePrefix);
			const newKey = getRandomBytes(20);
			await subStore.set(newKey, getRandomBytes(10));
			jest.spyOn(db, 'get');

			await subStore.get(newKey);

			expect(db.get).not.toHaveBeenCalled();
		});

		it('should get from the database if the key does not exist', async () => {
			jest.spyOn(db, 'get');
			const subStore = stateStore.getStore(moduleID, storePrefix);

			const value = await subStore.get(existingKey);

			expect(value).toEqual(existingValue);
			expect(db.get).toHaveBeenCalledTimes(1);
		});

		it('should return copied value', async () => {
			const subStore = stateStore.getStore(moduleID, storePrefix);

			const value = await subStore.get(existingKey);
			value[0] = 233;

			const valueFetchedAgain = await subStore.get(existingKey);

			expect(valueFetchedAgain).not.toEqual(value);
		});

		it('should throw not found error if deleted in the key', async () => {
			const subStore = stateStore.getStore(moduleID, storePrefix);
			await subStore.del(existingKey);

			await expect(subStore.get(existingKey)).rejects.toThrow(NotFoundError);
		});
	});

	describe('getWithSchema', () => {
		it('should return decoded value', async () => {
			const address = getRandomBytes(20);
			const encodedValue = codec.encode(sampleSchema, { address });
			const subStore = stateStore.getStore(moduleID, storePrefix);
			await subStore.set(address, encodedValue);

			const value = await subStore.getWithSchema<Record<string, unknown>>(address, sampleSchema);

			expect(value.address).toEqual(address);
		});
	});

	describe('set', () => {
		it('should update the cached value if it exist in the cache', async () => {
			const address = getRandomBytes(20);
			const value = getRandomBytes(50);
			const subStore = stateStore.getStore(moduleID, storePrefix);

			await subStore.set(address, value);
			const updatingValue = await subStore.get(address);
			updatingValue[0] = 122;

			await subStore.set(address, updatingValue);

			const updatedValue = await subStore.get(address);

			expect(updatedValue).toEqual(updatingValue);
		});

		it('should cache the original value and update the cache if it does not exist in the cache', async () => {
			jest.spyOn(db, 'get');
			const address = getRandomBytes(20);
			const value = getRandomBytes(50);
			const subStore = stateStore.getStore(moduleID, storePrefix);

			await subStore.set(address, value);
			const updatingValue = await subStore.get(address);

			expect(db.get).toHaveBeenCalledTimes(1);
			expect(updatingValue).toEqual(value);
		});
	});

	describe('setWithSchema', () => {
		it('should set encoded value', async () => {
			const address = getRandomBytes(20);
			const encodedValue = codec.encode(sampleSchema, { address });
			const subStore = stateStore.getStore(moduleID, storePrefix);
			await subStore.setWithSchema(address, { address }, sampleSchema);

			const value = await subStore.get(address);

			expect(value).toEqual(encodedValue);
		});
	});

	describe('del', () => {
		const address = getRandomBytes(20);
		const value = getRandomBytes(50);

		it('should mark as deleted if it exists in the cache', async () => {
			const subStore = stateStore.getStore(moduleID, storePrefix);

			await subStore.set(address, value);
			await subStore.del(address);

			await expect(subStore.get(address)).rejects.toThrow(NotFoundError);
		});

		it('should cache the original value and mark as deleted if it does not in the cache', async () => {
			jest.spyOn(db, 'get');
			const subStore = stateStore.getStore(moduleID, storePrefix);
			await subStore.del(existingKey);

			expect(db.get).toHaveReturnedTimes(1);
			await expect(subStore.get(address)).rejects.toThrow(NotFoundError);
		});
	});

	describe('iterate', () => {
		it('should return all the key-values with the prefix', async () => {
			const subStore = stateStore.getStore(moduleID, 1);
			await subStore.set(Buffer.from([0]), getRandomBytes(40));
			await subStore.set(Buffer.from([1]), getRandomBytes(40));
			await subStore.set(Buffer.from([2]), getRandomBytes(40));

			const result = await subStore.iterate({
				start: Buffer.from([0]),
				end: Buffer.from([255]),
			});

			expect(result).toHaveLength(3);
			expect(result[0].key).toEqual(Buffer.from([0]));
			expect(result[2].key).toEqual(Buffer.from([2]));
		});

		it('should return all the key-values with the prefix in reverse order', async () => {
			const existingStore = stateStore.getStore(moduleID, storePrefix);
			await existingStore.set(Buffer.from([0]), getRandomBytes(40));
			const subStore = stateStore.getStore(moduleID, 1);
			await subStore.set(Buffer.from([0]), getRandomBytes(40));
			await subStore.set(Buffer.from([1]), getRandomBytes(40));
			await subStore.set(Buffer.from([2]), getRandomBytes(40));

			const result = await subStore.iterate({
				start: Buffer.from([0]),
				end: Buffer.from([255]),
				reverse: true,
				limit: 2,
			});

			expect(result).toHaveLength(2);
			expect(result[0].key).toEqual(Buffer.from([2]));
			expect(result[1].key).toEqual(Buffer.from([1]));
		});

		it('should not return the deleted values', async () => {
			const subStore = stateStore.getStore(moduleID, 1);
			await subStore.set(Buffer.from([0]), getRandomBytes(40));
			await subStore.set(Buffer.from([1]), getRandomBytes(40));
			await subStore.set(Buffer.from([2]), getRandomBytes(40));
			await subStore.del(Buffer.from([1]));

			const result = await subStore.iterate({
				start: Buffer.from([0]),
				end: Buffer.from([255]),
			});

			expect(result).toHaveLength(2);
			expect(result[0].key).toEqual(Buffer.from([0]));
			expect(result[1].key).toEqual(Buffer.from([2]));
		});

		it('should return the updated values in the cache', async () => {
			const expectedValue = Buffer.from('random');
			const subStore = stateStore.getStore(moduleID, storePrefix);
			await subStore.set(Buffer.from([0]), getRandomBytes(40));
			await subStore.set(Buffer.from([1]), getRandomBytes(40));
			await subStore.set(Buffer.from([2]), getRandomBytes(40));

			await subStore.set(existingKey, expectedValue);

			const result = await subStore.iterate({
				start: Buffer.from([0]),
				end: Buffer.from([255]),
			});

			expect(result).toHaveLength(5);
			expect(result.find(r => r.key.equals(existingKey))?.value).toEqual(expectedValue);
		});
	});

	describe('iterateWithSchema', () => {
		it('should return decoded value', async () => {
			const address = getRandomBytes(20);
			const encodedValue = codec.encode(sampleSchema, { address });
			const subStore = stateStore.getStore(moduleID, 1);
			await subStore.set(Buffer.from([0]), encodedValue);
			await subStore.set(Buffer.from([1]), encodedValue);
			await subStore.set(Buffer.from([2]), encodedValue);

			const result = await subStore.iterateWithSchema(
				{
					start: Buffer.from([0]),
					end: Buffer.from([255]),
				},
				sampleSchema,
			);

			expect(result).toHaveLength(3);
			expect(result[0].value).toEqual({ address });
			expect(result[2].value).toEqual({ address });
		});
	});

	describe('snapshot', () => {
		it('should not change the snapshot data when other operation is triggered', async () => {
			const subStore = stateStore.getStore(moduleID, storePrefix);
			subStore.createSnapshot();
			const expected = getRandomBytes(64);
			await subStore.set(Buffer.from([0]), expected);
			await subStore.del(existingKey);

			await expect(subStore.get(Buffer.from([0]))).resolves.toEqual(expected);
			await expect(subStore.get(existingKey)).rejects.toThrow(NotFoundError);
		});

		it('should revert to snapshot value when the restore is called', async () => {
			const subStore = stateStore.getStore(moduleID, storePrefix);
			subStore.createSnapshot();
			await subStore.set(Buffer.from([0]), getRandomBytes(64));
			await subStore.del(existingKey);
			subStore.revertSnapshot();

			await expect(subStore.get(Buffer.from([0]))).rejects.toThrow(NotFoundError);
			await expect(subStore.get(existingKey)).resolves.toEqual(existingValue);
		});
	});

	describe('finalize', () => {
		let batch: DatabaseWriter;

		beforeEach(async () => {
			const subStore = stateStore.getStore(moduleID, storePrefix);
			await subStore.set(existingKey, getRandomBytes(40));
			await subStore.del(existingKey2);
			const anotherStore = stateStore.getStore(moduleID, 1);
			await anotherStore.set(Buffer.from([0]), getRandomBytes(40));
			await anotherStore.set(Buffer.from([1]), getRandomBytes(40));
			await anotherStore.set(Buffer.from([2]), getRandomBytes(40));
			await anotherStore.del(Buffer.from([2]));
			batch = {
				put: jest.fn(),
				del: jest.fn(),
			};
		});

		it('should set all the newly created and updated values', () => {
			stateStore.finalize(batch);

			expect(batch.put).toHaveBeenCalledTimes(3);
			expect(batch.del).toHaveBeenCalledTimes(1);
		});

		it('should return state diff', () => {
			const diff = stateStore.finalize(batch);
			expect(diff.created).toHaveLength(2);
			expect(diff.updated).toHaveLength(1);
			expect(diff.deleted).toHaveLength(1);
		});
	});
});
