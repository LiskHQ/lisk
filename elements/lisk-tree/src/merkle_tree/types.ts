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
export type NonNullableStruct<T> = { [P in keyof T]: NonNullable<T[P]>; };

export const enum NodeType {
	BRANCH = 'branch',
	LEAF = 'leaf',
}
export interface NodeData {
	readonly value: Buffer;
	readonly hash: Buffer;
}
export interface NodeInfo {
	readonly type: NodeType;
	readonly hash: Buffer;
	readonly value: Buffer;
	readonly leftHash: Buffer;
	readonly rightHash: Buffer;
	readonly layerIndex: number;
	readonly nodeIndex: number;
}

export interface NodeHash {
	hash: Buffer;
	layerIndex: number | undefined;
	nodeIndex: number | undefined;
}

export const enum NodeSide {
	LEFT = 0,
	RIGHT,
}
export interface TreeStructure {
	[key: number]: NodeInfo[];
}

export interface NodeIndex {
	layerIndex: number | undefined;
	nodeIndex: number | undefined;
}

export interface Proof {
	readonly siblingHashes: ReadonlyArray<{
		hash: Buffer;
		layerIndex: number | undefined;
		nodeIndex: number | undefined;
	}>;
	readonly indexes: ReadonlyArray<{
		layerIndex: number | undefined;
		nodeIndex: number | undefined;
	}>;
	readonly size: number;
}

export interface NodeLocation {
	readonly layerIndex: number;
	readonly nodeIndex: number;
	readonly side?: NodeSide;
}

export interface SiblingHash {
	hash: Buffer;
	layerIndex: number;
	nodeIndex: number;
}

export type VerifyResult = ReadonlyArray<{ hash: Buffer; verified: boolean }>;

export interface Database {
	get(key: Buffer): Promise<Buffer>;
	set(key: Buffer, value: Buffer): Promise<void>;
}
