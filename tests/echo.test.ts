import { sendEcho, awaitShareEcho, startListeningForAllEchoes } from '../src/echo.js';
import { EchoError } from '../src/types.js';

jest.mock('@frostr/bifrost', () => {
  const mockNode = {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    off: jest.fn(),
    req: {
      echo: jest.fn()
    },
    client: { connected: true },
    peers: [],
    constructor: { name: 'MockBifrostNode' }
  };

  const decodeGroup = jest.fn().mockReturnValue({
    threshold: 2,
    relays: ['wss://relay.group']
  });

  const decodeShare = jest.fn().mockReturnValue({ idx: 0 });

  return {
    BifrostNode: jest.fn().mockImplementation(() => mockNode),
    PackageEncoder: {
      group: { decode: decodeGroup },
      share: { decode: decodeShare }
    },
    __mockNode: mockNode,
    __mockDecodeGroup: decodeGroup,
    __mockDecodeShare: decodeShare
  };
});

describe('sendEcho', () => {
const {
  __mockNode: mockNode,
  __mockDecodeGroup,
  __mockDecodeShare,
  BifrostNode: BifrostNodeMock
} = require('@frostr/bifrost');

  beforeEach(() => {
    jest.clearAllMocks();
    mockNode.req.echo.mockReset();
    mockNode.connect.mockClear();
    mockNode.close.mockClear();
    mockNode.on.mockClear();
    mockNode.off.mockClear();
    __mockDecodeGroup.mockClear();
    __mockDecodeShare.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends the provided challenge and resolves when the request succeeds', async () => {
    mockNode.req.echo.mockResolvedValue({ ok: true, data: 'echo-data' });

    await expect(
      sendEcho('group-credential-2-3', 'share-credential-0', 'deadbeef', { timeout: 5000 })
    ).resolves.toBe(true);

    expect(mockNode.req.echo).toHaveBeenCalledWith('deadbeef');
    const constructorArgs = BifrostNodeMock.mock.calls[0];
    expect(constructorArgs[2]).toEqual(['wss://relay.group']);
  });

  it('rejects with EchoError when the request returns an error', async () => {
    mockNode.req.echo.mockResolvedValue({ ok: false, err: 'not-allowed' });

    const promise = sendEcho('group-credential-2-3', 'share-credential-0', 'feedface');

    await expect(promise).rejects.toThrow(EchoError);
    await expect(promise).rejects.toThrow('Echo request failed: not-allowed');
  });

  it('rejects with EchoError if the request times out', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockNode.req.echo.mockImplementation(() => new Promise(() => {}));

    const promise = sendEcho('group-credential-2-3', 'share-credential-0', 'cafebabe', { timeout: 5000 })
      .catch(error => error);

    await jest.advanceTimersByTimeAsync(5000);

    const error = await promise;
    expect(error).toBeInstanceOf(EchoError);
    expect(error).toMatchObject({ message: 'Echo response timeout after 5 seconds' });
  });

  it('throws when challenge is empty after trimming', async () => {
    await expect(
      sendEcho('group-credential-2-3', 'share-credential-0', '   ')
    ).rejects.toThrow('Echo challenge must be provided as a non-empty hexadecimal string.');
  });

  it('throws when challenge is not hexadecimal', async () => {
    await expect(
      sendEcho('group-credential-2-3', 'share-credential-0', 'ghij')
    ).rejects.toThrow('Echo challenge must be an even-length hexadecimal string.');
  });

  it('trims whitespace before sending the challenge', async () => {
    mockNode.req.echo.mockResolvedValue({ ok: true, data: 'echo-data' });

    await expect(
      sendEcho('group-credential-2-3', 'share-credential-0', ' deadbeef ')
    ).resolves.toBe(true);

    expect(mockNode.req.echo).toHaveBeenCalledWith('deadbeef');
  });
});

describe('echo listeners (awaitShareEcho/startListeningForAllEchoes)', () => {
  const {
    __mockNode: mockNode,
    __mockDecodeGroup,
    __mockDecodeShare
  } = require('@frostr/bifrost');

  let handlers: Map<string, Function[]>;

  const emit = (event: string, payload?: any) => {
    const fns = handlers.get(event) || [];
    fns.forEach(fn => fn(payload));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = new Map();
    mockNode.connect.mockResolvedValue(undefined);
    mockNode.close.mockResolvedValue(undefined);
    mockNode.on.mockImplementation((event: string, fn: Function) => {
      const arr = handlers.get(event) || [];
      arr.push(fn);
      handlers.set(event, arr);
    });
    mockNode.off.mockImplementation((event: string, fn: Function) => {
      const arr = handlers.get(event) || [];
      handlers.set(
        event,
        arr.filter(f => f !== fn)
      );
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('awaitShareEcho resolves on legacy \'/echo/req\' with data "echo"', async () => {
    const promise = awaitShareEcho('group-credential-2-3', 'share-credential-0', { timeout: 5000 });

    // Simulate incoming legacy echo packet
    emit('message', { tag: '/echo/req', data: 'echo' });

    await expect(promise).resolves.toBe(true);
  });

  it('awaitShareEcho resolves on challenge-hex payload', async () => {
    const promise = awaitShareEcho('group-credential-2-3', 'share-credential-0', { timeout: 5000 });

    // Simulate incoming challenge-hex echo packet
    emit('message', { tag: '/echo/req', data: 'deadbeef' });

    await expect(promise).resolves.toBe(true);
  });

  it('awaitShareEcho ignores malformed payloads and times out', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });

    const promise = awaitShareEcho('group-credential-2-3', 'share-credential-0', { timeout: 2000 })
      .catch(e => e);

    // Non-matching tag
    emit('message', { tag: '/wrong/tag', data: 'echo' });
    // Wrong data (non-hex)
    emit('message', { tag: '/echo/req', data: 'not-hex' });
    // Odd-length hex
    emit('message', { tag: '/echo/req', data: 'abc' });

    await jest.advanceTimersByTimeAsync(2000);

    const error = await promise;
    expect(error).toBeInstanceOf(EchoError);
    expect(String(error.message)).toBe('No echo received within 2 seconds');
  });

  it('startListeningForAllEchoes invokes callback on legacy packet', async () => {
    const onEcho = jest.fn();
    const listener = startListeningForAllEchoes(
      'group-credential-2-3',
      ['share-credential-0'],
      onEcho
    );

    emit('message', { tag: '/echo/req', data: 'echo' });

    expect(onEcho).toHaveBeenCalledWith(0, 'share-credential-0');
    listener.cleanup();
  });

  it('startListeningForAllEchoes invokes callback on challenge-hex packet', async () => {
    const onEcho = jest.fn();
    const listener = startListeningForAllEchoes(
      'group-credential-2-3',
      ['share-credential-0'],
      onEcho
    );

    emit('message', { tag: '/echo/req', data: 'cafebabe' });

    expect(onEcho).toHaveBeenCalledWith(0, 'share-credential-0');
    listener.cleanup();
  });
});
