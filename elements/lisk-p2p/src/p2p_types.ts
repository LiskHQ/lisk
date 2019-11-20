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
 *
 */
import { ConnectionKind, PeerKind } from './constants';

export interface P2PRequestPacket {
	readonly data?: unknown;
	readonly procedure: string;
}

export interface P2PResponsePacket {
	readonly peerId?: string;
	readonly data: unknown;
}

export interface P2PMessagePacket {
	readonly peerId?: string;
	readonly data?: unknown;
	readonly event: string;
}

export interface P2PClosePacket {
	readonly peerInfo: P2PPeerInfo;
	readonly code: number;
	readonly reason?: string;
}

export interface P2PPenalty {
	readonly peerId: string;
	readonly penalty: number;
}

export interface P2PPeersCount {
	readonly outboundCount: number;
	readonly inboundCount: number;
}

export interface P2PSharedState {
	readonly wsPort: number;
	readonly advertiseAddress: boolean;
	readonly protocolVersion?: string;
	readonly nethash?: string;
	readonly nonce?: string;
	// tslint:disable-next-line: no-mixed-interface
	readonly [key: string]: unknown;
}

export interface P2PInternalState {
	readonly dateAdded?: Date;
	readonly peerKind?: PeerKind;
	readonly isBanned?: boolean;
	readonly productivity?: number;
	readonly reputation?: number;
	readonly connectionKind?: ConnectionKind;
}

export interface P2PBasicPeerInfo {
	// String to uniquely identify each peer
	readonly id: string;
	readonly ipAddress: string;
}

export interface P2PPeerInfo extends P2PBasicPeerInfo {
	readonly sharedState: P2PSharedState;
	readonly internalState?: P2PInternalState;
}

export interface P2PConfig {
	readonly sharedState: P2PSharedState;
	readonly blacklistedIPs?: ReadonlyArray<string>;
	readonly seedPeers?: ReadonlyArray<P2PPeerInfo>;
	readonly fixedPeers?: ReadonlyArray<P2PPeerInfo>;
	readonly whitelistedPeers?: ReadonlyArray<P2PPeerInfo>;
	readonly previousPeers?: ReadonlyArray<P2PPeerInfo>;
	readonly connectTimeout?: number;
	readonly ackTimeout?: number;
	readonly hostAddress?: string;
	readonly wsEngine?: string;
	readonly populatorInterval?: number;
	readonly maxOutboundConnections: number;
	readonly maxInboundConnections: number;
	readonly wsMaxPayload?: number;
	readonly peerSelectionForSend?: P2PPeerSelectionForSendFunction;
	readonly peerSelectionForRequest?: P2PPeerSelectionForRequestFunction;
	readonly peerSelectionForConnection?: P2PPeerSelectionForConnectionFunction;
	readonly peerHandshakeCheck?: P2PCheckPeerCompatibility;
	readonly peerBanTime?: number;
	readonly sendPeerLimit?: number;
	readonly outboundShuffleInterval?: number;
	readonly latencyProtectionRatio?: number;
	readonly productivityProtectionRatio?: number;
	readonly longevityProtectionRatio?: number;
	readonly netgroupProtectionRatio?: number;
	readonly hostIp?: string;
	readonly wsMaxMessageRate?: number;
	readonly wsMaxMessageRatePenalty?: number;
	readonly rateCalculationInterval?: number;
	readonly minimumPeerDiscoveryThreshold?: number;
	readonly peerDiscoveryResponseLength?: number;
	readonly maxPeerDiscoveryResponseLength?: number;
	readonly maxPeerInfoSize?: number;
	readonly secret?: number;
}

export interface P2PPeerSelectionForSendInput {
	readonly peers: ReadonlyArray<P2PPeerInfo>;
	readonly peerLimit?: number;
	readonly messagePacket?: P2PMessagePacket;
}

export type P2PPeerSelectionForSendFunction = (
	input: P2PPeerSelectionForSendInput,
) => ReadonlyArray<P2PPeerInfo>;

export interface P2PPeerSelectionForRequestInput {
	readonly peers: ReadonlyArray<P2PPeerInfo>;
	readonly peerLimit?: number;
	readonly requestPacket?: P2PRequestPacket;
}

export type P2PPeerSelectionForRequestFunction = (
	input: P2PPeerSelectionForRequestInput,
) => ReadonlyArray<P2PPeerInfo>;

export interface P2PPeerSelectionForConnectionInput {
	readonly newPeers: ReadonlyArray<P2PPeerInfo>;
	readonly triedPeers: ReadonlyArray<P2PPeerInfo>;
	readonly peerLimit?: number;
}

export type P2PPeerSelectionForConnectionFunction = (
	input: P2PPeerSelectionForConnectionInput,
) => ReadonlyArray<P2PPeerInfo>;

export interface P2PCompatibilityCheckReturnType {
	readonly success: boolean;
	readonly error?: string;
}

export type P2PCheckPeerCompatibility = (
	newSharedState: P2PSharedState,
	mySharedState: P2PSharedState,
) => P2PCompatibilityCheckReturnType;

export interface PeerLists {
	readonly blacklistedIPs: ReadonlyArray<string>;
	readonly seeds: ReadonlyArray<P2PPeerInfo>;
	readonly fixed: ReadonlyArray<P2PPeerInfo>;
	readonly whitelisted: ReadonlyArray<P2PPeerInfo>;
	readonly previous: ReadonlyArray<P2PPeerInfo>;
}
