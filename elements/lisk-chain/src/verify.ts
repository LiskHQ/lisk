/*
 * Copyright © 2019 Lisk Foundation
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
import * as createDebug from 'debug';
import { codec } from '@liskhq/lisk-codec';
import { getAddressFromPublicKey, hash } from '@liskhq/lisk-cryptography';
import { DataAccess } from './data_access';
import { BlockHeader, Block, GenesisBlock, Validator } from './types';
import { StateStore } from './state_store';
import { Slots } from './slots';
import { validatorsSchema } from './schema';
import { DB_KEY_CONSENSUS_STATE_VALIDATORS } from './db_keys';

const debug = createDebug('lisk:chain:verify');

export const verifyBlockNotExists = async (dataAccess: DataAccess, block: Block): Promise<void> => {
	const isPersisted = await dataAccess.isBlockPersisted(block.header.id);
	if (isPersisted) {
		throw new Error(`Block ${block.header.id.toString('hex')} already exists`);
	}
};

export const verifyPreviousBlockId = (block: Block, lastBlock: Block): void => {
	const isConsecutiveBlock =
		lastBlock.header.height + 1 === block.header.height &&
		block.header.previousBlockID.equals(lastBlock.header.id);

	if (!isConsecutiveBlock) {
		throw new Error('Invalid previous block');
	}
};

export const matchGenesisBlock = (genesisBlock: GenesisBlock, block: BlockHeader): boolean =>
	block.id.equals(genesisBlock.header.id) &&
	block.version === genesisBlock.header.version &&
	block.transactionRoot.equals(genesisBlock.header.transactionRoot) &&
	block.signature.equals(genesisBlock.header.signature);

export const verifyBlockGenerator = async (
	header: BlockHeader,
	slots: Slots,
	stateStore: StateStore,
): Promise<void> => {
	const currentSlot = slots.getSlotNumber(header.timestamp);

	const validatorsBuffer = await stateStore.consensus.get(DB_KEY_CONSENSUS_STATE_VALIDATORS);

	if (!validatorsBuffer) {
		throw new Error(
			`Failed to verify slot: ${currentSlot.toString()} for block Height: ${
				header.height
			} - No validator was found`,
		);
	}
	const { validators } = codec.decode<{ validators: Validator[] }>(
		validatorsSchema,
		validatorsBuffer,
	);

	// Get delegate public key that was supposed to forge the block
	const expectedValidator = validators[currentSlot % validators.length];

	// Verify if forger exists and matches the generatorPublicKey on block
	const generatorAddress = getAddressFromPublicKey(header.generatorPublicKey);
	if (!generatorAddress.equals(expectedValidator.address)) {
		throw new Error(
			`Failed to verify generator: ${generatorAddress.toString(
				'hex',
			)} Expected: ${expectedValidator.address.toString('hex')}. Block Height: ${header.height}`,
		);
	}
};

const lastValidatorsSetHeight = (height: number, numberOfValidators: number): number =>
	Math.max(Math.ceil(height / numberOfValidators) - 2, 0) * numberOfValidators + 1;

export const isValidSeedReveal = (
	blockHeader: BlockHeader,
	stateStore: StateStore,
	numberOfValidators: number,
): boolean => {
	const { lastBlockHeaders } = stateStore.chain;

	const lastForgedBlock = lastBlockHeaders.filter(
		block =>
			block.generatorPublicKey.equals(blockHeader.generatorPublicKey) &&
			block.height >= lastValidatorsSetHeight(blockHeader.height, numberOfValidators),
	);

	if (!lastForgedBlock.length) {
		// If the forger didn't forge any block in the last three rounds
		debug('Validator did not create any block in current or last validator set', {
			generatorPublicKey: blockHeader.generatorPublicKey,
			height: blockHeader.height,
		});

		return true;
	}

	const {
		asset: { seedReveal: previousBlockSeedReveal },
	} = lastForgedBlock[0];
	const {
		asset: { seedReveal: newBlockSeedReveal },
	} = blockHeader;
	const SEED_REVEAL_BYTE_SIZE = 16;
	const newBlockSeedRevealBuffer = hash(newBlockSeedReveal).slice(0, SEED_REVEAL_BYTE_SIZE);

	// New block seed reveal should be a preimage of the last block seed reveal
	if (previousBlockSeedReveal.equals(newBlockSeedRevealBuffer)) {
		return true;
	}

	debug('New block SeedReveal is not the preimage of last block', {
		newBlockSeedReveal: newBlockSeedRevealBuffer.toString('hex'),
		previousBlockSeedReveal,
		delegate: blockHeader.generatorPublicKey,
		height: blockHeader.height,
	});

	return false;
};

export const verifyReward = (
	blockHeader: BlockHeader,
	stateStore: StateStore,
	numberOfValidators: number,
): void => {
	if (
		!isValidSeedReveal(blockHeader, stateStore, numberOfValidators) &&
		blockHeader.reward !== BigInt(0)
	) {
		throw new Error(`Invalid block reward: ${blockHeader.reward.toString()} expected: 0`);
	}
};
