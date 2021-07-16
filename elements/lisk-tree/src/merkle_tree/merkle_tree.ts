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
/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/prefer-for-of */

import { hash } from '@liskhq/lisk-cryptography';
import { dataStructures } from '@liskhq/lisk-utils';
import { hash } from '../../../lisk-cryptography/dist-node';
import { calculatePathNodes } from './calculate';
import {
	LAYER_INDEX_SIZE,
	NODE_INDEX_SIZE,
	NODE_HASH_SIZE,
	EMPTY_HASH,
	LEAF_PREFIX,
	BRANCH_PREFIX,
	PREFIX_HASH_TO_VALUE,
	PREFIX_LOC_TO_HASH,
} from './constants';
import { InMemoryDB } from './inmemory_db';
import { PrefixStore } from './prefix_store';
import { NodeData, NodeInfo, NodeType, NodeSide, Proof, Database, NodeLocation, SiblingHash, NodeIndex, NonNullableStruct } from './types';
import {
	generateHash,
	getBinaryString,
	isLeaf,
	getPairLocation,
	getRightSiblingInfo,
	getParentLocation,
	buildLeaf,
	buildBranch,
} from './utils';

export class MerkleTree {
	private _root: Buffer;
	private _size = 0;
	private readonly _preHashedLeaf: boolean;
	private readonly _db: Database;

	private readonly _hashToValueMap: PrefixStore;
	private readonly _locationToHashMap: PrefixStore;

	public constructor(options?: { preHashedLeaf?: boolean; db?: Database }) {
		this._db = options?.db ?? new InMemoryDB();
		this._hashToValueMap = new PrefixStore(this._db, PREFIX_HASH_TO_VALUE);
		this._locationToHashMap = new PrefixStore(this._db, PREFIX_LOC_TO_HASH);
		this._preHashedLeaf = options?.preHashedLeaf ?? false;

		this._root = EMPTY_HASH;
	}

	public async init(initValues: Buffer[]): Promise<void> {
		if (initValues.length <= 1) {
			const rootNode = initValues.length
				? await this._generateLeaf(initValues[0], 0)
				: { hash: EMPTY_HASH, value: Buffer.alloc(0) };
			this._root = rootNode.hash;
			await this._hashToValueMap.set(this._root, rootNode.value);
			await this._locationToHashMap.set(getBinaryString(0, this._getHeight()), this._root);
			this._size = initValues.length ? 1 : 0;
			return;
		}

		this._root = await this._build(initValues);
	}

	public get root(): Buffer {
		return this._root;
	}

	public get size(): number {
		return this._size;
	}

	public async getNode(nodeHash: Buffer): Promise<NodeInfo> {
		const value = await this._hashToValueMap.get(nodeHash);

		if (!value) {
			throw new Error(`Hash does not exist in merkle tree: ${nodeHash.toString('hex')}`);
		}

		const type = isLeaf(value) ? NodeType.LEAF : NodeType.BRANCH;
		const layerIndex = type === NodeType.LEAF ? 0 : value.readInt8(BRANCH_PREFIX.length);
		const nodeIndex =
			type === NodeType.BRANCH
				? value.readInt32BE(BRANCH_PREFIX.length + LAYER_INDEX_SIZE)
				: value.readInt32BE(LEAF_PREFIX.length);
		const rightHash = type === NodeType.BRANCH ? value.slice(-1 * NODE_HASH_SIZE) : Buffer.alloc(0);
		const leftHash =
			type === NodeType.BRANCH
				? value.slice(-2 * NODE_HASH_SIZE, -1 * NODE_HASH_SIZE)
				: Buffer.alloc(0);

		return {
			type,
			hash: nodeHash,
			value,
			layerIndex,
			nodeIndex,
			rightHash,
			leftHash,
		};
	}

	public async getAppendPathHashes(): Promise<Buffer[]> {
		const appendPathNodes = await this._getAppendPathNodes();
		return appendPathNodes.map(p => p.hash);
	}

	public async append(value: Buffer): Promise<Buffer> {
		if (this._size === 0) {
			const leaf = await this._generateLeaf(value, 0);
			this._root = leaf.hash;
			this._size += 1;
			return this._root;
		}
		const appendPath = await this._getAppendPathNodes();
		const appendData = await this._generateLeaf(value, this._size);
		let currentNode = await this.getNode(appendData.hash);
		for (let i = 0; i < appendPath.length; i += 1) {
			const leftNodeInfo = appendPath[i];
			const newBranchNode = await this._generateBranch(
				leftNodeInfo.hash,
				currentNode.hash,
				leftNodeInfo.layerIndex + 1,
				leftNodeInfo.nodeIndex + 1,
			);
			currentNode = await this.getNode(newBranchNode.hash);
		}
		this._root = currentNode.hash;
		this._size += 1;
		return this.root;
	}

	public async generateProof(queryData: ReadonlyArray<Buffer>): Promise<Proof> {
		if (this._size === 0) {
			return {
				siblingHashes: [],
				indexes: [],
				size: 0,
			};
		}
		const siblingHashes = [];
		const addedPath = new dataStructures.BufferSet();
		const indexes = [];
		let queryNode: NodeInfo | undefined;

		for (let i = 0; i < queryData.length; i += 1) {
			// Flag missing nodes
			try {
				queryNode = await this.getNode(queryData[i]);
			} catch (err) {
				siblingHashes.push({
					hash: queryData[i],
					layerIndex: undefined,
					nodeIndex: undefined,
				});
				indexes.push({
					layerIndex: undefined,
					nodeIndex: undefined,
				});
				continue;
			}

			// If tree has one non-empty leaf
			if (this._size === 1 && this._root.equals(queryNode.hash)) {
				if (!addedPath.has(queryNode.hash)) {
					addedPath.add(queryNode.hash);
					siblingHashes.push({
						hash: queryNode.hash,
						layerIndex: 0,
						nodeIndex: 0,
					});
					indexes.push({
						layerIndex: 0,
						nodeIndex: 0,
					});
				}
				continue;
			}

			indexes.push({
				layerIndex: queryNode.layerIndex,
				nodeIndex: queryNode.nodeIndex,
			});

			let currentNode = queryNode;
			while (!currentNode.hash.equals(this._root)) {
				const {
					layerIndex: pairLayerIndex,
					nodeIndex: pairNodeIndex,
					side: pairSide,
				} = getPairLocation({
					layerIndex: currentNode.layerIndex,
					nodeIndex: currentNode.nodeIndex,
					size: this._size,
				});

				const pairNodeHash = (await this._locationToHashMap.get(
					getBinaryString(pairNodeIndex, this._getHeight() - pairLayerIndex),
				)) as Buffer;
				if (!addedPath.has(pairNodeHash)) {
					addedPath.add(pairNodeHash);
					siblingHashes.push({
						hash: pairNodeHash,
						layerIndex: pairLayerIndex,
						nodeIndex: pairNodeIndex,
					});
				}
				const leftHashBuffer = pairSide === NodeSide.LEFT ? pairNodeHash : currentNode.hash;
				const rightHashBuffer = pairSide === NodeSide.RIGHT ? pairNodeHash : currentNode.hash;
				const parentNodeHash = generateHash(BRANCH_PREFIX, leftHashBuffer, rightHashBuffer);
				currentNode = await this.getNode(parentNodeHash);
			}
		}

		return {
			siblingHashes,
			indexes,
			size: this._size,
		};
	}

	// idx is the first element of right tree
	public async generateRightWitness(idx: number): Promise<Buffer[]> {
		if (idx < 0 || idx > this._size) {
			throw new Error('index out of range');
		}
		if (this._size === idx) {
			return [];
		}
		if (idx === 0) {
			return this.getAppendPathHashes();
		}
		const height = this._getHeight();
		const size = this._size;
		const rightWitness: Buffer[] = [];
		let incrementalIdx = idx;
		for (let layerIndex = 0; layerIndex < height; layerIndex += 1) {
			const digit = (incrementalIdx >>> layerIndex) & 1;
			if (digit === 0) {
				continue;
			}
			const leftTreeLastIdx = idx - 1;
			const nodeIndex = leftTreeLastIdx >> layerIndex;
			const siblingInfo = getRightSiblingInfo(nodeIndex, layerIndex, size);
			if (!siblingInfo) {
				break;
			}
			const nodeHash = await this._locationToHashMap.get(
				getBinaryString(siblingInfo.nodeIndex, height - siblingInfo.layerIndex),
			);
			if (!nodeHash) {
				throw new Error(
					`Invalid tree state. Node at ${siblingInfo.nodeIndex} in layer ${siblingInfo.layerIndex} does not exist for size ${this.size}`,
				);
			}
			rightWitness.push(nodeHash);
			incrementalIdx += 1 << layerIndex;
		}
		return rightWitness;
	}


	public async getSiblingHashes(idxs: ReadonlyArray<NodeIndex>): Promise<SiblingHash[]> {
		if (this._size === 0) {
			return []
		}

		const sortedIndexes = idxs.map(idx => ({ ...idx }));
		// Remove empty indexes
		for (let  i = 0; i < sortedIndexes.length; i += 1) {
			const index = sortedIndexes[i];
			if (index.layerIndex === undefined || index.nodeIndex === undefined) {
				sortedIndexes[i] = sortedIndexes[sortedIndexes.length - 1]
				sortedIndexes.pop();
			}
		}
		// Indexes must be ordered from bottom-left to top-right
		(sortedIndexes as NonNullableStruct<NodeIndex>[]).sort((a: NonNullableStruct<NodeIndex>, b: NonNullableStruct<NodeIndex>) => {
			if (a.layerIndex !== b.layerIndex) return a.layerIndex - b.layerIndex;
			return a.nodeIndex - b.nodeIndex;
		});

		const indexes: Record<string, NodeLocation> = {};
		for (const index of (sortedIndexes as NonNullableStruct<NodeIndex>[])) {
			const binaryIndex = getBinaryString(index.nodeIndex, this._getHeight() - index.layerIndex).toString();
			indexes[binaryIndex] = index;
		}

		const siblingHashes = [];
		let currentNode: NodeInfo | undefined;
		let currentNodeHash = Buffer.alloc(0);

		while(!(Object.keys(indexes)[0] === undefined)) {
			const currentLocation = indexes[Object.keys(indexes)[0]];
			const {
				nodeIndex: currentNodeIndex,
				layerIndex: currentLayerIndex,
			} = currentLocation;
			const binaryIndex = getBinaryString(currentNodeIndex, this._getHeight() - currentLayerIndex).toString();

			try {
				currentNodeHash = (await this._locationToHashMap.get(
					getBinaryString(currentNodeIndex, this._getHeight() - currentLayerIndex),
				)) as Buffer;
				currentNode = await this.getNode(currentNodeHash);
			} catch (err) {
				delete indexes[binaryIndex];
				continue;
			}

			const {
				layerIndex: pairLayerIndex,
				nodeIndex: pairNodeIndex,
			} = getPairLocation({
				layerIndex: currentNode.layerIndex,
				nodeIndex: currentNode.nodeIndex,
				size: this._size,
			});
			const pairNodeLocation: NodeLocation = {
				layerIndex: pairLayerIndex,
				nodeIndex: pairNodeIndex,
			};

			const pairBinaryIndex = getBinaryString(pairNodeIndex, this._getHeight() - pairLayerIndex).toString();

			const pairNodeHash = (await this._locationToHashMap.get(
				getBinaryString(pairNodeIndex, this._getHeight() - pairLayerIndex),
			)) as Buffer;

			if (indexes[pairBinaryIndex]) {
				delete indexes[pairBinaryIndex];
			} else {
				siblingHashes.push({
					hash: pairNodeHash,
					layerIndex: pairLayerIndex,
					nodeIndex: pairNodeIndex,
				});
			}

			delete indexes[binaryIndex];

			const parentIndex: NodeLocation = getParentLocation(currentLocation, pairNodeLocation);
			const {
				layerIndex: parentLayerIndex,
				nodeIndex: parentNodeIndex,
			} = parentIndex;
			const parentBinaryIndex = getBinaryString(parentNodeIndex, this._getHeight() - parentLayerIndex).toString();

			if (parentBinaryIndex !== '0') {
				indexes[parentBinaryIndex] = parentIndex;
			}
		}

		return siblingHashes;
	}

	public async update(idxs: ReadonlyArray<NodeIndex>, updateData: ReadonlyArray<Buffer>) {
		const updateHashes = [];

		for (const data of updateData) {
			const leafValueWithoutNodeIndex = Buffer.concat(
				[LEAF_PREFIX, data],
				LEAF_PREFIX.length + data.length,
			);
			const leafHash = hash(leafValueWithoutNodeIndex);
			updateHashes.push(leafHash);
		}

		const pairHashes = await this.getSiblingHashes(idxs);
		const calculatedTree = calculatePathNodes(updateHashes, this._size, idxs, pairHashes);
		
		for (const [binaryIndex, updatedNode] of Object.entries(calculatedTree)) {
			if (binaryIndex !== '0') {
				const existingHash = await this._locationToHashMap.get(
					getBinaryString(updatedNode.nodeIndex, this._getHeight() - updatedNode.layerIndex),
				);
				await this._hashToValueMap.set(existingHash as Buffer, updatedNode.value);
				await this._locationToHashMap.set(
					getBinaryString(updatedNode.nodeIndex, this._getHeight() - updatedNode.layerIndex),
					updatedNode.hash,
				);
			}
		}

		const calculatedRoot = calculatedTree['0'].hash;

		return calculatedRoot;
	}

	public async toString(): Promise<string> {
		if (this._size === 0) {
			return this.root.toString('hex');
		}
		return this._printNode(this.root);
	}

	private _getHeight(): number {
		return Math.ceil(Math.log2(this._size)) + 1;
	}

	private async _generateLeaf(value: Buffer, nodeIndex: number): Promise<NodeData> {
		const {
			leafValueWithNodeIndex,
			leafHash,
		} = buildLeaf(value, nodeIndex, this._preHashedLeaf);
		await this._hashToValueMap.set(leafHash, leafValueWithNodeIndex);
		await this._locationToHashMap.set(getBinaryString(nodeIndex, this._getHeight()), leafHash);

		return {
			value: leafValueWithNodeIndex,
			hash: leafHash,
		};
	}

	private async _generateBranch(
		leftHashBuffer: Buffer,
		rightHashBuffer: Buffer,
		layerIndex: number,
		nodeIndex: number,
	): Promise<NodeData> {
		const {
			branchHash,
			branchValue,
		} = buildBranch(
			leftHashBuffer,
			rightHashBuffer,
			layerIndex,
			nodeIndex,
		);

		await this._hashToValueMap.set(branchHash, branchValue);
		await this._locationToHashMap.set(
			getBinaryString(nodeIndex, this._getHeight() - layerIndex),
			branchHash,
		);

		return {
			hash: branchHash,
			value: branchValue,
		};
	}

	private async _build(initValues: Buffer[]): Promise<Buffer> {
		// Generate hash and buffer of leaves and store in memory
		const leafHashes = [];
		this._size = initValues.length;
		for (let i = 0; i < initValues.length; i += 1) {
			const leaf = await this._generateLeaf(initValues[i], i);
			leafHashes.push(leaf.hash);
		}

		// Start from base layer
		let currentLayerIndex = 0;
		let currentLayerHashes = leafHashes;
		let orphanNodeHashInPreviousLayer: Buffer | undefined;
		// Loop through each layer as long as there are nodes or an orphan node from previous layer
		while (currentLayerHashes.length > 1 || orphanNodeHashInPreviousLayer !== undefined) {
			const pairsOfHashes: Array<[Buffer, Buffer]> = [];

			// Make pairs from the current layer nodes
			for (let i = 0; i < currentLayerHashes.length - 1; i += 2) {
				pairsOfHashes.push([currentLayerHashes[i], currentLayerHashes[i + 1]]);
			}

			// If there is one node left from pairs
			if (currentLayerHashes.length % 2 === 1) {
				// If no orphan node left from previous layer, set the last node to new orphan node
				if (orphanNodeHashInPreviousLayer === undefined) {
					orphanNodeHashInPreviousLayer = currentLayerHashes[currentLayerHashes.length - 1];

					// If one orphan node left from previous layer then pair with last node
				} else {
					pairsOfHashes.push([
						currentLayerHashes[currentLayerHashes.length - 1],
						orphanNodeHashInPreviousLayer,
					]);
					orphanNodeHashInPreviousLayer = undefined;
				}
			}

			// Generate hash and buffer for the parent layer and store
			const parentLayerHashes = [];
			for (let i = 0; i < pairsOfHashes.length; i += 1) {
				const leftHash = pairsOfHashes[i][0];
				const rightHash = pairsOfHashes[i][1];
				const node = await this._generateBranch(leftHash, rightHash, currentLayerIndex + 1, i);

				parentLayerHashes.push(node.hash);
			}

			// Set current layer to parent layer
			currentLayerHashes = parentLayerHashes;
			currentLayerIndex += 1;
		}

		return currentLayerHashes[0];
	}

	private async _getAppendPathNodes(): Promise<NodeInfo[]> {
		if (this._size === 0) {
			return [];
		}
		// Create the appendPath
		const appendPath: NodeInfo[] = [];
		let currentNode = await this.getNode(this._root);

		// If tree is fully balanced
		if (this._size === 2 ** (this._getHeight() - 1)) {
			appendPath.push(currentNode);
		} else {
			// We start from the root layer and traverse each layer down the tree on the right side
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
			while (true) {
				const currentLayer = currentNode.layerIndex;
				let currentLayerSize = this._size >> currentLayer;
				// if layer has odd nodes and current node is odd (hence index is even)
				if (currentLayerSize % 2 === 1 && currentNode.nodeIndex % 2 === 0) {
					appendPath.push(currentNode);
				}
				// if node is leaf, break
				if (currentNode.type === NodeType.LEAF) {
					break;
				}
				// if layer below is odd numbered, push left child
				currentLayerSize = this._size >> (currentLayer - 1);
				if (currentLayerSize % 2 === 1) {
					const leftNode = await this.getNode(currentNode.leftHash);
					appendPath.push(leftNode);
				}

				// go to right child
				currentNode = await this.getNode(currentNode.rightHash);
			}
		}
		// Append path should be from bottom
		return appendPath.reverse();
	}

	private async _printNode(hashValue: Buffer, level = 1): Promise<string> {
		const nodeValue = await this._hashToValueMap.get(hashValue);
		if (nodeValue && isLeaf(nodeValue)) {
			return hashValue.toString('hex');
		}

		const node = await this.getNode(hashValue);
		const left = await this._printNode(node.leftHash, level + 1);
		const right = await this._printNode(node.rightHash, level + 1);
		return [
			hashValue.toString('hex'),
			`├${' ─ '.repeat(level)} ${left}`,
			`├${' ─ '.repeat(level)} ${right}`,
		].join('\n');
	}
}
