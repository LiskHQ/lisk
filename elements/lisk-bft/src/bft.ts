/*
 * Copyright © 2018 Lisk Foundation
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
import * as assert from 'assert';
import { EventEmitter } from 'events';
import {
	BlockHeader,
	Chain,
	DB_KEY_CONSENSUS_STATE_FINALIZED_HEIGHT,
	getValidators,
	StateStore,
} from '@liskhq/lisk-chain';
import { EVENT_BFT_FINALIZED_HEIGHT_CHANGED, FinalityManager } from './finality_manager';
import * as forkChoiceRule from './fork_choice_rule';
import { BFTPersistedValues, ForkStatus } from './types';
import { BFT_ROUND_THRESHOLD } from './constant';

export const EVENT_BFT_BLOCK_FINALIZED = 'EVENT_BFT_BLOCK_FINALIZED';

export const BFTFinalizedHeightCodecSchema = {
	type: 'object',
	$id: '/BFT/FinalizedHeight',
	title: 'Lisk BFT Finalized Height',
	properties: {
		finalizedHeight: {
			dataType: 'uint32',
			fieldNumber: 1,
		},
	},
	required: ['finalizedHeight'],
};

codec.addSchema(BFTFinalizedHeightCodecSchema);

/**
 * BFT class responsible to hold integration logic for finality manager with the framework
 */
export class BFT extends EventEmitter {
	public readonly constants: {
		threshold: number;
		genesisHeight: number;
	};

	private _finalityManager?: FinalityManager;
	private readonly _chain: Chain;

	public constructor({
		chain,
		threshold,
		genesisHeight,
	}: {
		readonly chain: Chain;
		readonly threshold: number;
		readonly genesisHeight: number;
	}) {
		super();
		this._chain = chain;
		this.constants = {
			threshold,
			genesisHeight,
		};
	}

	public async init(stateStore: StateStore): Promise<void> {
		this._finalityManager = await this._initFinalityManager(stateStore);

		this.finalityManager.on(EVENT_BFT_FINALIZED_HEIGHT_CHANGED, updatedFinalizedHeight => {
			this.emit(EVENT_BFT_FINALIZED_HEIGHT_CHANGED, updatedFinalizedHeight);
		});
	}

	public get finalityManager(): FinalityManager {
		return this._finalityManager as FinalityManager;
	}

	public async applyBlockHeader(block: BlockHeader, stateStore: StateStore): Promise<void> {
		await this.finalityManager.addBlockHeader(block, stateStore);
		const { finalizedHeight } = this.finalityManager;

		await stateStore.consensus.set(
			DB_KEY_CONSENSUS_STATE_FINALIZED_HEIGHT,
			codec.encode(BFTFinalizedHeightCodecSchema, { finalizedHeight }),
		);
	}

	public async verifyBlockHeader(blockHeader: BlockHeader, stateStore: StateStore): Promise<void> {
		const isCompliant = await this.isBFTProtocolCompliant(blockHeader, stateStore);
		const reward = this._chain.calculateExpectedReward(blockHeader, stateStore);
		const expectedReward = isCompliant ? reward : reward / BigInt(4);
		if (blockHeader.reward !== expectedReward) {
			throw new Error(
				`Invalid block reward: ${blockHeader.reward.toString()} expected: ${expectedReward.toString()}`,
			);
		}
		await this.finalityManager.verifyBlockHeaders(blockHeader, stateStore);
	}

	public forkChoice(blockHeader: BlockHeader, lastBlockHeader: BlockHeader): ForkStatus {
		// Current time since Lisk Epoch
		const receivedBlock = {
			...blockHeader,
			receivedAt: this._chain.slots.timeSinceGenesis(),
		};

		/* Cases are numbered following LIP-0014 Fork choice rule.
		 See: https://github.com/LiskHQ/lips/blob/master/proposals/lip-0014.md#applying-blocks-according-to-fork-choice-rule
			 Case 2 and 1 have flipped execution order for better readability. Behavior is still the same */

		if (forkChoiceRule.isValidBlock(lastBlockHeader, receivedBlock)) {
			// Case 2: correct block received
			return ForkStatus.VALID_BLOCK;
		}

		if (forkChoiceRule.isIdenticalBlock(lastBlockHeader, receivedBlock)) {
			// Case 1: same block received twice
			return ForkStatus.IDENTICAL_BLOCK;
		}

		if (forkChoiceRule.isDoubleForging(lastBlockHeader, receivedBlock)) {
			// Delegates are the same
			// Case 3: double forging different blocks in the same slot.
			// Last Block stands.
			return ForkStatus.DOUBLE_FORGING;
		}

		if (
			forkChoiceRule.isTieBreak({
				slots: this._chain.slots,
				lastAppliedBlock: lastBlockHeader,
				receivedBlock,
			})
		) {
			// Two competing blocks by different delegates at the same height.
			// Case 4: Tie break
			return ForkStatus.TIE_BREAK;
		}

		if (forkChoiceRule.isDifferentChain(lastBlockHeader, receivedBlock)) {
			// Case 5: received block has priority. Move to a different chain.
			return ForkStatus.DIFFERENT_CHAIN;
		}

		// Discard newly received block
		return ForkStatus.DISCARD;
	}

	public async isBFTProtocolCompliant(
		blockHeader: BlockHeader,
		stateStore: StateStore,
	): Promise<boolean> {
		assert(blockHeader, 'No block was provided to be verified');

		const validators = await getValidators(stateStore);
		const numberOfVotingValidators = validators.filter(
			validator => validator.isConsensusParticipant,
		).length;

		const heightThreshold = numberOfVotingValidators * BFT_ROUND_THRESHOLD;

		// Special case to avoid reducing the reward of delegates forging for the first time before the `heightThreshold` height
		if (blockHeader.asset.maxHeightPreviouslyForged === 0) {
			return true;
		}

		if (blockHeader.height <= blockHeader.asset.maxHeightPreviouslyForged) {
			return false;
		}

		// If maxHeightPreviouslyForged is not in threshold, it is BFT compliant
		if (blockHeader.height - blockHeader.asset.maxHeightPreviouslyForged > heightThreshold) {
			return true;
		}

		const maxHeightPreviouslyForgedBlock = stateStore.chain.lastBlockHeaders.find(
			bftHeader => bftHeader.height === blockHeader.asset.maxHeightPreviouslyForged,
		);

		if (!maxHeightPreviouslyForgedBlock) {
			throw new Error(
				`Block at height ${blockHeader.asset.maxHeightPreviouslyForged} must be in the lastBlockHeaders.`,
			);
		}

		if (!blockHeader.generatorPublicKey.equals(maxHeightPreviouslyForgedBlock.generatorPublicKey)) {
			return false;
		}

		return true;
	}

	public async getMaxHeightPrevoted(): Promise<number> {
		return this.finalityManager.getMaxHeightPrevoted();
	}

	public get finalizedHeight(): number {
		return this.finalityManager.finalizedHeight;
	}

	private async _initFinalityManager(stateStore: StateStore): Promise<FinalityManager> {
		// Check what finalized height was stored last time
		const storedFinalizedHeightBuffer = await stateStore.consensus.get(
			DB_KEY_CONSENSUS_STATE_FINALIZED_HEIGHT,
		);

		// Choose max between stored finalized height or genesis height
		const finalizedHeight =
			storedFinalizedHeightBuffer === undefined
				? this.constants.genesisHeight
				: codec.decode<BFTPersistedValues>(
						BFTFinalizedHeightCodecSchema,
						storedFinalizedHeightBuffer,
				  ).finalizedHeight;

		// Initialize consensus manager
		const finalityManager = new FinalityManager({
			chain: this._chain,
			finalizedHeight,
			threshold: this.constants.threshold,
		});

		return finalityManager;
	}
}
