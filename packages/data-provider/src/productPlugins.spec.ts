import {
  assertProductPluginSupportedByHost,
  compareHostVersions,
  ProductPluginContractError,
  sanitizeMCPUIResource,
} from './productPlugins';

function manifest() {
  return {
    schemaVersion: 1,
    id: 'mcp-ui-resource',
    version: 'v1',
    status: 'deployed',
    kind: 'product_plugin',
    actions: [],
    scopes: [],
    clientPrimitiveId: 'mcp-ui-resource',
    minHostVersion: '0.8.7',
    payloadSchema: {
      schemaVersion: 1,
      id: 'mcp-ui-resource-payload',
      fields: [
        { name: 'uri', type: 'ui_uri', required: true, maxLength: 256 },
        { name: 'mimeType', type: 'mime_type', required: true, maxLength: 64 },
        { name: 'text', type: 'html', required: true, maxLength: 200000 },
      ],
    },
  };
}

describe('product client primitive registry', () => {
  it('accepts the deployed primitive manifest on a compatible host', () => {
    expect(assertProductPluginSupportedByHost(manifest(), 'v0.8.7')).toEqual(manifest());
    expect(compareHostVersions('v0.8.8', '0.8.7')).toBe(1);
    expect(compareHostVersions('0.8.7', 'v0.8.7')).toBe(0);
  });

  it('fails closed for unknown primitives, older hosts and schema drift', () => {
    expect(() =>
      assertProductPluginSupportedByHost(
        { ...manifest(), clientPrimitiveId: 'unknown-primitive' },
        'v0.8.7',
      ),
    ).toThrow('not registered');
    expect(() => assertProductPluginSupportedByHost(manifest(), 'v0.8.6')).toThrow(
      'requires host 0.8.7',
    );
    const drifted = manifest();
    drifted.payloadSchema.fields[2].maxLength = 199999;
    expect(() => assertProductPluginSupportedByHost(drifted, 'v0.8.7')).toThrow(
      'payload schema mismatch',
    );
  });

  it('sanitizes MCP UI resources down to the renderer contract', () => {
    expect(
      sanitizeMCPUIResource({
        resourceId: 'resource-1',
        uri: 'ui://future-lines/report',
        mimeType: 'text/html',
        text: '<p>report</p>',
        blob: 'must-not-cross-render-boundary',
      }),
    ).toEqual({
      resourceId: 'resource-1',
      uri: 'ui://future-lines/report',
      mimeType: 'text/html',
      text: '<p>report</p>',
    });
  });

  it.each([
    { uri: 'https://example.com', mimeType: 'text/html', text: '<p>x</p>' },
    { uri: 'ui://ok', mimeType: 'application/json', text: '<p>x</p>' },
    { uri: 'ui://bad\npath', mimeType: 'text/html', text: '<p>x</p>' },
    { uri: 'ui://bad path', mimeType: 'text/html', text: '<p>x</p>' },
    { uri: 'ui://ok', mimeType: 'text/html', text: undefined },
  ])('rejects invalid MCP UI payloads %#', (payload) => {
    expect(() => sanitizeMCPUIResource({ resourceId: 'resource-1', ...payload })).toThrow(
      ProductPluginContractError,
    );
  });
});
