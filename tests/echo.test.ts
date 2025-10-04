import { sendEcho } from '../src/echo.js';
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
});
