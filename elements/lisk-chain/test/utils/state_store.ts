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

import { KVStore } from '@liskhq/lisk-db';
import { StateStore } from '../../src/state_store_v1';
import { DataAccess } from '../../src/data_access';
import { defaultAccountSchema, defaultAccount } from './account';
import { registeredBlockHeaders, defaultNetworkIdentifier } from './block';
import { BlockHeader } from '../../src';

export const createStateStore = (db: KVStore, lastBlockHeaders: BlockHeader[] = []): StateStore => {
	const dataAccess = new DataAccess({
		db,
		accountSchema: defaultAccountSchema,
		registeredBlockHeaders,
		minBlockHeaderCache: 505,
		maxBlockHeaderCache: 309,
	});
	return new StateStore(dataAccess, {
		lastBlockHeaders,
		networkIdentifier: defaultNetworkIdentifier,
		lastBlockReward: BigInt(500000000),
		defaultAccount,
	});
};
