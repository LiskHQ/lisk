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

import { hash } from '@liskhq/lisk-cryptography';
import { BRANCH_PREFIX, LAYER_INDEX_SIZE, LEAF_PREFIX, NODE_HASH_SIZE, NODE_INDEX_SIZE } from './constants';
import { NodeLocation, NodeSide, NodeType, SiblingHash } from './types';

export const isLeaf = (value: Buffer): boolean => value[0] === LEAF_PREFIX[0];

export const generateHash = (prefix: Buffer, leftHash: Buffer, rightHash: Buffer): Buffer =>
	hash(
		Buffer.concat(
			[prefix, leftHash, rightHash],
			prefix.length + leftHash.length + rightHash.length,
		),
	);

export const getMaxIdxAtLayer = (layer: number, size: number): number => {
	let [max, r] = [size, 0];
	for (let i = 0; i < layer; i += 1) {
		[max, r] = [[Math.floor, Math.ceil][r % 2](max / 2), r + (max % 2)];
	}
	return max;
};

export const getLayerStructure = (size: number): number[] => {
	const structure = [];
	for (let i = 0; i <= Math.ceil(Math.log2(size)); i += 1) {
		structure.push(getMaxIdxAtLayer(i, size));
	}

	return structure;
};

export const getHeight = (size: number) => Math.ceil(Math.log2(size)) + 1;

export const getBinaryString = (num: number, length: number): Buffer => {
	if (length === 0) {
		return Buffer.alloc(0);
	}
	let binaryString = num.toString(2);
	while (binaryString.length < length) {
		binaryString = `0${binaryString}`;
	}

	return Buffer.from(binaryString, 'utf8');
};

export const getBinary = (num: number, length: number): number[] => {
	const binaryString = getBinaryString(num, length).toString('utf8');

	return binaryString.split('').map(d => parseInt(d, 10));
};

export const getRightSiblingInfo = (
	nodeIndex: number,
	layerIndex: number,
	size: number,
): NodeLocation | undefined => {
	const structure = getLayerStructure(size);
	let siblingNodeIndex = ((nodeIndex >>> 1) << 1) + ((nodeIndex + 1) % 2);
	let siblingLayerIndex = layerIndex;
	while (siblingNodeIndex >= structure[siblingLayerIndex] && siblingLayerIndex > 0) {
		siblingNodeIndex <<= 1;
		siblingLayerIndex -= 1;
	}
	if (siblingLayerIndex === 0 && siblingNodeIndex >= size) {
		return undefined;
	}
	return {
		nodeIndex: siblingNodeIndex,
		layerIndex: siblingLayerIndex,
	};
};

export const getPairLocation = (nodeInfo: {
	layerIndex: number;
	nodeIndex: number;
	size: number;
}): NodeLocation => {
	const { layerIndex, nodeIndex, size } = nodeInfo;
	const treeHeight = Math.ceil(Math.log2(size)) + 1;
	const layerStructure = getLayerStructure(size);
	const numberOfNodesInLayer = layerStructure[layerIndex];
	const binary = getBinary(nodeIndex, treeHeight - layerIndex);
	const side = [NodeSide.LEFT, NodeSide.RIGHT][binary[binary.length - 1]];
	const pairSide = side === NodeSide.LEFT ? NodeSide.RIGHT : NodeSide.LEFT;

	// If queried node is root, provide root node location
	if (layerIndex + 1 === treeHeight) {
		return { layerIndex: treeHeight - 1, nodeIndex: 0 };
	}
	// If node is left node not last element in the layer
	if (side === NodeSide.LEFT && nodeIndex < numberOfNodesInLayer - 1) {
		const pairNodeIndex = nodeIndex + 1;
		return { layerIndex, nodeIndex: pairNodeIndex, side: pairSide };
	}
	// If node is right node AND (not last element in layer OR last element in the layer with even # of nodes)
	if (
		side === NodeSide.RIGHT &&
		((numberOfNodesInLayer % 2 === 0 && nodeIndex === numberOfNodesInLayer - 1) ||
			(nodeIndex < numberOfNodesInLayer - 1 && nodeIndex < numberOfNodesInLayer - 1))
	) {
		const pairNodeIndex = nodeIndex - 1;
		return { layerIndex, nodeIndex: pairNodeIndex, side: pairSide };
	}
	// Otherwise find next odd numbered layer
	let currentLayer = layerIndex;
	// Get direction to traverse tree
	const numOfOddLayers = layerStructure
		.slice(0, currentLayer)
		.filter(num => num % 2 !== 0)
		.reduce((acc, val) => acc + val, 0);
	const direction = numOfOddLayers % 2 === 0 ? 1 : -1;
	let pairLocation;
	currentLayer += direction;
	while (currentLayer >= 0 && currentLayer <= treeHeight - 1) {
		if (layerStructure[currentLayer] % 2 !== 0) {
			const pairNodeIndex =
				direction === 1
					? layerStructure[currentLayer] + direction * -1
					: layerStructure[currentLayer] - direction * -1;
			pairLocation = {
				layerIndex: currentLayer,
				nodeIndex: pairNodeIndex,
				side: direction === -1 ? NodeSide.RIGHT : NodeSide.LEFT,
			};
			break;
		}
		currentLayer += direction;
	}

	return pairLocation as NodeLocation;
};

export const getParentLocation = (nodeLocation: NodeLocation, pairNodeLocation: NodeLocation) => {
	const parentLayerIndex = Math.max(nodeLocation.layerIndex, pairNodeLocation.layerIndex) + 1;
	const parentNodeIndex = Math.min(
		Math.floor(nodeLocation.nodeIndex / 2),
		Math.floor(pairNodeLocation.nodeIndex / 2),
	);

	return {
		layerIndex: parentLayerIndex,
		nodeIndex: parentNodeIndex,
	};
}

export const generateNode = (nodeHash: Buffer, val: Buffer) => {
	const value = val;

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

export const buildLeaf = (value: Buffer, nodeIndex: number, preHashedLeaf?: boolean) => {
	const nodeIndexBuffer = Buffer.alloc(NODE_INDEX_SIZE);
	nodeIndexBuffer.writeInt32BE(nodeIndex, 0);
	// As per protocol nodeIndex is not included in hash
	const leafValueWithoutNodeIndex = Buffer.concat(
		[LEAF_PREFIX, value],
		LEAF_PREFIX.length + value.length,
	);
	const leafHash = preHashedLeaf ? value : hash(leafValueWithoutNodeIndex);
	// We include nodeIndex into the value to allow for nodeIndex retrieval for leaf nodes
	const leafValueWithNodeIndex = Buffer.concat(
		[LEAF_PREFIX, nodeIndexBuffer, value],
		LEAF_PREFIX.length + nodeIndexBuffer.length + value.length,
	);

	return {
		leafValueWithNodeIndex,
		leafHash,
	};
}

export const buildBranch = (
	leftHashBuffer: Buffer,
	rightHashBuffer: Buffer,
	layerIndex: number,
	nodeIndex: number,
) => {
	const layerIndexBuffer = Buffer.alloc(LAYER_INDEX_SIZE);
	const nodeIndexBuffer = Buffer.alloc(NODE_INDEX_SIZE);
	layerIndexBuffer.writeInt8(layerIndex, 0);
	nodeIndexBuffer.writeInt32BE(nodeIndex, 0);

	const branchValue = Buffer.concat(
		[BRANCH_PREFIX, layerIndexBuffer, nodeIndexBuffer, leftHashBuffer, rightHashBuffer],
		BRANCH_PREFIX.length +
			layerIndexBuffer.length +
			nodeIndexBuffer.length +
			leftHashBuffer.length +
			rightHashBuffer.length,
	);
	const branchHash = generateHash(BRANCH_PREFIX, leftHashBuffer, rightHashBuffer);
	
	return {
		branchHash,
		branchValue,
	};
}

export const createNewBranchNode = (location: NodeLocation, pairHash: Buffer, currentHash: Buffer, pairSide: NodeSide) => {
	const leftHashBuffer = pairSide === NodeSide.LEFT ? pairHash : currentHash;
	const rightHashBuffer = pairSide === NodeSide.RIGHT ? pairHash : currentHash;
	const newNodeData = buildBranch(leftHashBuffer, rightHashBuffer, location.layerIndex, location.nodeIndex);
	const newNode = generateNode(newNodeData.branchHash, newNodeData.branchValue);

	return newNode;
}

export const createNewLeafNode = (value: Buffer, nodeIndex: number, preHashed: boolean) => {
	const newNodeData = buildLeaf(value, nodeIndex, preHashed);
	const newNode = generateNode(newNodeData.leafHash, newNodeData.leafValueWithNodeIndex)

	return newNode;
}

export const isLocationEqualToSiblingHash = (location: NodeLocation, siblingHash: SiblingHash) => 
	location.layerIndex === siblingHash.layerIndex && location.nodeIndex === siblingHash.nodeIndex;