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

import { codec } from '@liskhq/lisk-codec';
import { Validator } from '../types';
import { validatorsSchema } from '../schema';
import { DB_KEY_CONSENSUS_STATE_VALIDATORS } from '../db_keys';

interface MinimalStateStore {
	consensus: {
		get: (key: Buffer) => Promise<Buffer | undefined>;
	};
}

export const getValidators = async (stateStore: MinimalStateStore): Promise<Validator[]> => {
	const validatorsBuffer = await stateStore.consensus.get(DB_KEY_CONSENSUS_STATE_VALIDATORS);
	if (!validatorsBuffer) {
		throw new Error('Validator set must exist');
	}
	const { validators } = codec.decode<{ validators: Validator[] }>(
		validatorsSchema,
		validatorsBuffer,
	);

	return validators;
};
