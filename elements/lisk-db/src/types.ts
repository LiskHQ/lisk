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

export interface Options {
	readonly gt?: Buffer;
	readonly gte?: Buffer;
	readonly lt?: Buffer;
	readonly lte?: Buffer;
	readonly reverse?: boolean;
	readonly limit?: number;
}

export interface BatchChain {
	put: (key: Buffer, value: Buffer) => this;
	del: (key: Buffer) => this;
	clear: () => this;
	write: () => Promise<this>;
	readonly length: number;
}

export interface ReadStreamOptions extends Options {
	readonly keys?: boolean;
	readonly values?: boolean;
}
