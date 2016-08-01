/**
 * @file Unit tests for the socket background module.
 * @author Daniil Filippov <filippovdaniil@gmail.com>
 */

require('../background.js');
var sinon = require('sinon');
var assertStyles = require('../../assert-styles.js');
var expect = assertStyles.expect;

describe('socket module', function () {
  describe('Socket class', function () {
    // Reference to the sinon sandbox:
    var sandbox;
    // Reference to the Socket class instance:
    var socket;

    beforeEach(function () {
      sandbox = sinon.sandbox.create();
      sandbox.useFakeTimers();
      sandbox.spy(global, 'WebSocket');
      sandbox.spy(global, 'CustomEvent');
      sandbox.spy(kango.console, 'log');
      sandbox.stub(WebSocket.prototype, 'send');
      sandbox.stub(WebSocket.prototype, 'close');
      sandbox.stub(WebSocket.prototype, 'dispatchEvent');
      // Creating a Socket class instance:
      socket = new Socket;
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should correctly setup a WebSocket instance ' +
        'with the connect() method', function () {
      socket.connect(1337, '1337');
      expect(WebSocket).to.be.calledWithExactly(sinon.match.string);
      expect(socket._ws).to.be.an.instanceof(WebSocket);
      expect(socket._ws.onopen).to.be.a('function');
      expect(socket._ws.onerror).to.be.a('function');
      expect(socket._ws.onclose).to.be.a('function');
      expect(socket._ws.onmessage).to.be.a('function');
    });

    it('should reject a connection with a TypeError, ' +
        'if the id or hash were not specified', function () {
      return expect(socket.connect()).to.be.rejectedWith(TypeError);
    });

    it('should send the correct auth request when the WebSocket is opened', function () {
      socket.connect(1337, '7331');
      socket._ws.onopen();
      expect(WebSocket.prototype.send).to.be.calledWithExactly('["auth 1337:7331"]');
    });

    it('should reject connect() promise if the authentication was failed', function () {
      var promise = socket.connect(1337, '7331');
      socket._ws.onopen();
      socket._ws.onmessage({ data: 'a["auth failed"]' });
      return expect(promise).to.be.rejectedWith('a["auth failed"]');
    });

    it('should reject connect() promise if the WebSocket was closed ' +
        'not cleanly', function () {
      var promise = socket.connect(1337, '7331');
      socket._ws.onclose({
        wasClean: false,
        code: 1012,
        reason: 'Server is restarting',
      });
      return expect(promise).to.be.rejectedWith('Server is restarting');
    });

    it('should fulfill connect() promise if the authentication ' +
        'was completed successfully', function () {
      var promise = socket.connect(1337, '7331');
      socket._ws.onopen();
      socket._ws.onmessage({ data: 'a["auth ok"]' });
      return expect(promise).to.eventually.be.equal('a["auth ok"]');
    });

    it('should send subscribe messages only after the authentication ' +
        'process', function () {
      // Stubbing the _auth method to avoid extra call of the WebSocket.prototype.send:
      sandbox.stub(Socket.prototype, '_auth');
      socket.connect(1337, '7331');
      socket.on('someEvent', function () {});
      socket._ws.onopen();
      expect(WebSocket.prototype.send).to.have.not.been.called;
      socket._ws.onmessage({ data: 'a["auth ok"]' });
      expect(WebSocket.prototype.send).to.have.been.calledOnce
        .to.have.been.calledWithExactly('["subscribe someEvent"]');
    });

    it('should send a subscribe message only once per event type', function () {
      // Stubbing the _auth method to avoid extra call of the WebSocket.prototype.send:
      sandbox.stub(Socket.prototype, '_auth');
      socket.on('someEvent1', function () {});
      var promise = socket.connect(1337, '7331');
      socket.on('someEvent2', function () {});
      socket._ws.onopen();
      socket.on('someEvent2', function () {});
      socket.on('someEvent1', function () {});
      socket._ws.onmessage({ data: 'a["auth ok"]' });
      return promise.then(function () {
        socket.on('someEvent2', function () {});
        socket.on('someEvent3', function () {});
        expect(WebSocket.prototype.send).to.have.been.calledThrice
          .to.have.been.calledWithExactly('["subscribe someEvent1"]')
          .to.have.been.calledWithExactly('["subscribe someEvent2"]')
          .to.have.been.calledWithExactly('["subscribe someEvent3"]');
      });
    });

    it('should broadcast an event message to all subscribers', function () {
      var spy1 = sinon.spy();
      var spy2 = sinon.spy();
      socket.on('someEvent1', spy1);
      var promise = socket.connect(1337, '7331');
      socket.on('someEvent1', spy1);
      socket._ws.onopen();
      socket._ws.onmessage({ data: 'a["auth ok"]' });
      return promise.then(function () {
        socket.on('someEvent2', spy2);
        socket._ws.onmessage({ data: 'a["[\"someEvent1\",{\"message\":1}]"]' });
        socket._ws.onmessage({ data: 'a["[\"someEvent2\",{\"message\":2}]"]' });
        expect(spy1).to.have.been.calledTwice
          .to.have.been.calledWithExactly({ message: 1 });
        expect(spy2).to.have.been.calledOnce
          .to.have.been.calledWithExactly({ message: 2 });
      });
    });

    it('should ignore all messages with bad JSON', function () {
      var spy1 = sinon.spy();
      socket.on('someEvent1', spy1);
      var promise = socket.connect(1337, '7331');
      socket._ws.onopen();
      socket._ws.onmessage({ data: 'a["auth ok"]' });
      return promise.then(function () {
        expect(function () {
          socket._ws.onmessage({ data: 'a["[\"someEvent1\",{\"bad json]"]' });
        }).to.not.throw();
        expect(function () {
          socket._ws.onmessage({ data: 'a["\"someEvent1\",{\"message\":1}"]' });
        }).to.not.throw();
        expect(spy1).to.have.not.been.called;
      });
    });

    it('should raise a WebSocket error, if the heartbeat frame was not received after ' +
        '40 seconds', function () {
      socket.connect(1337, '1337');
      socket._ws.onopen();
      sandbox.clock.tick(40 * 1000);
      socket._ws.onmessage({ data: 'h' });
      sandbox.clock.tick(39 * 1000);
      socket._ws.onmessage({ data: 'h' });
      sandbox.clock.tick(1 * 1000);
      expect(CustomEvent).to.have.been.calledOnce
        .to.have.been.calledWithExactly('error', {
          detail: {
            code: 4000,
            reason: 'Connection closed by client due to server inactivity.',
          }
        });
      expect(WebSocket.prototype.dispatchEvent).to.have.been.calledOnce
        .to.have.been.calledAfter(CustomEvent);
    });

    it('should log a message if the WebSocket was closed not cleanly', function () {
      socket.connect(1337, '1337');
      socket._ws.onopen();
      socket._ws.onmessage({ data: 'a["auth ok"]' });
      socket._ws.onclose({ wasClean: false });
      socket._ws.onclose({ wasClean: true, code: 4000 });
      expect(kango.console.log).to.have.been.calledTwice;
    });

    it('should close current WebSocket connection with disconnect() ' +
        'method', function () {
      socket.connect(1337, '1337');
      socket._ws.onopen();
      socket._ws.readyState = WebSocket.prototype.OPEN;
      socket.disconnect(4000, 'Connection closed.');
      expect(WebSocket.prototype.close)
        .to.have.been.calledWithExactly(4000, 'Connection closed.');
    });

    it('should call the disconnect() method on any WebSocket error', function () {
      var spy = sandbox.spy(socket, 'disconnect');
      socket.connect(1337, '1337');
      socket._ws.onerror({});
      socket._ws.onerror({ detail: { code: 4000, reason: 'Connection closed.' } });
      expect(spy).to.have.been.calledTwice;
    });

    it('should log a message and call the custom onError function ' +
        'on any WebSocket error', function () {
      var spy = sinon.spy();
      socket.onError = spy;
      socket.connect(1337, '1337');
      socket._ws.onerror({ detail: { code: 4000, reason: 'Connection closed.' } });
      expect(spy)
        .to.have.been
        .calledWithExactly({ detail: { code: 4000, reason: 'Connection closed.' } });
      expect(kango.console.log)
        .to.have.been.calledWithExactly('A WebSocket error has occured.');
    });
  });
});