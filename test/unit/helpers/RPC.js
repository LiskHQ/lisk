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
'use strict';

var express = require('express');

var constants = require('../../../helpers/constants');
var WAMPClient = require('wamp-socket-cluster/WAMPClient');

var wsRPC = require('../../../api/ws/rpc/wsRPC').wsRPC;
var ClientRPCStub = require('../../../api/ws/rpc/wsRPC').ClientRPCStub;
var ConnectionState = require('../../../api/ws/rpc/wsRPC').ConnectionState;

var MasterWAMPServer = require('wamp-socket-cluster/MasterWAMPServer');

var socketClusterMock = {
	on: sinonSandbox.spy()
};

describe('wsRPC', function () {

	beforeEach(function () {
		wsRPC.clientsConnectionsMap = {};
	});

	it('should have empty clientsConnectionsMap field', function () {
		wsRPC.should.have.property('clientsConnectionsMap').to.be.a('object').and.to.be.empty;
	});

	it('should have wampClient field of instance WAMPClient', function () {
		wsRPC.should.have.property('wampClient').and.to.be.a('object');
		wsRPC.wampClient.constructor.name.should.equal('WAMPClient');
	});

	it('should have scClient field without connections', function () {
		wsRPC.should.have.property('scClient').and.to.be.a('object');
		wsRPC.scClient.should.have.property('connections').to.be.a('object').and.to.be.empty;
	});

	describe('setServer', function () {

		before(function () {
			wsRPC.setServer(null);
		});

		after(function () {
			wsRPC.setServer(null);
		});

		it('should return server instance after setting it', function () {
			wsRPC.setServer({name: 'my ws server'});
			var wsRPCServer = wsRPC.getServer();
			wsRPCServer.should.be.an('object').eql({name: 'my ws server'});
		});

		describe('getter', function () {

			it('should throw an error when setting server to null', function () {
				wsRPC.setServer(null);
				wsRPC.getServer.should.throw('WS server has not been initialized!');
			});

			it('should throw an error when setting server to 0', function () {
				wsRPC.setServer(0);
				wsRPC.getServer.should.throw('WS server has not been initialized!');
			});

			it('should throw an error when setting server to undefined', function () {
				wsRPC.setServer(undefined);
				wsRPC.getServer.should.throw('WS server has not been initialized!');
			});
		});
	});

	describe('getServer', function () {

		before(function () {
			wsRPC.setServer(null);
		});

		after(function () {
			wsRPC.setServer(null);
		});

		it('should throw an error when WS server has not been initialized', function () {
			wsRPC.getServer.should.throw('WS server has not been initialized!');
		});

		it('should return WS server if set before', function () {
			wsRPC.setServer({name: 'my ws server'});
			wsRPC.getServer.should.not.to.throw;
			wsRPC.getServer().should.a('object').eql({name: 'my ws server'});
		});
	});

	describe('getClientRPCStub', function () {

		var initializeNewConnectionStub;

		var validPort = 4000, validIp = '127.0.0.1';

		beforeEach(function () {
			initializeNewConnectionStub = sinonSandbox.stub(ClientRPCStub.prototype, 'initializeNewConnection');
		});

		afterEach(function () {
			initializeNewConnectionStub.restore();
		});

		it('should throw error when no arguments specified', function () {
			wsRPC.getClientRPCStub.should.throw('RPC client needs ip and port to establish WS connection with: undefined:undefined');
		});

		it('should throw error when no port specified', function (done) {
			try {
				wsRPC.getClientRPCStub(validIp, undefined);
			} catch (er) {
				er.message.should.equal('RPC client needs ip and port to establish WS connection with: 127.0.0.1:undefined');
				return done();
			}
			done('Should not be here');
		});

		it('should throw error when no ip specified', function (done) {
			try {
				wsRPC.getClientRPCStub(undefined, validPort);
			} catch (er) {
				er.message.should.equal('RPC client needs ip and port to establish WS connection with: undefined:4000');
				return done();
			}
			done('Should not be here');
		});

		it('should not initialize new connection just after getting RPC stub', function () {
			wsRPC.getClientRPCStub(validIp, validPort);
			initializeNewConnectionStub.called.should.be.false;
		});

		it('should add new entry in clientsConnectionsMap after getting stub', function () {
			wsRPC.getClientRPCStub(validIp, validPort);
			wsRPC.clientsConnectionsMap.should.have.property(validIp + ':' + validPort).to.be.an.instanceof(ConnectionState);
		});

		it('should return empty client stub when no endpoints registered', function () {
			var rpcStub = wsRPC.getClientRPCStub(validIp, validPort);
			rpcStub.should.be.a('object').and.to.be.empty;
		});

		describe('stub', function () {

			var validRPCEndpoint = {
				'rpcProcedure': function (param) {
					return param;
				}
			};
			var masterWAMPServer;
			var masterWAMPServerConfig;
			var validEventEndpoint = {
				'eventProcedure': function (param) {
					return param;
				}
			};

			beforeEach(function () {
				masterWAMPServerConfig = {};
				masterWAMPServer = new MasterWAMPServer(socketClusterMock, masterWAMPServerConfig);
				wsRPC.setServer(masterWAMPServer);
			});

			after(function () {
				wsRPC.setServer(null);
			});

			it('should return client stub with rpc methods registered on MasterWAMPServer', function () {
				var wsServer = wsRPC.getServer();
				wsServer.reassignRPCEndpoints(validRPCEndpoint);
				var rpcStub = wsRPC.getClientRPCStub(validIp, validPort);
				rpcStub.should.have.property('rpcProcedure').and.to.be.a('function');
			});

			it('should return client stub with event and rpc methods registered on MasterWAMPServer', function () {
				var wsServer = wsRPC.getServer();
				wsServer.reassignRPCEndpoints(validRPCEndpoint);
				wsServer.reassignEventEndpoints(validEventEndpoint);
				var rpcStub = wsRPC.getClientRPCStub(validIp, validPort);
				rpcStub.should.have.property('eventProcedure').and.to.be.a('function');
				rpcStub.should.have.property('rpcProcedure').and.to.be.a('function');
			});
		});
	});
});
