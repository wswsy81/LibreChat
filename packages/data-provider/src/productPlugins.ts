import type { UIResource } from './schemas';

const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const VERSION_PATTERN = /^v[1-9][0-9]*$/;
const HOST_VERSION_PATTERN = /^v?\d+\.\d+\.\d+$/;
const ACTION_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}(?:\.[a-z][a-z0-9-]{1,63})+$/;
const UI_URI_PATTERN = /^ui:\/\/[^\s]+$/;
const DATA_SCOPES = new Set(['profile.read', 'profile.write', 'conversation.read', 'report.write']);
const PAYLOAD_FIELD_TYPES = new Set(['ui_uri', 'mime_type', 'html']);
const BUILD_HOST_VERSION = '__LIBRECHAT_VERSION__';

export const PRODUCT_HOST_VERSION = BUILD_HOST_VERSION.startsWith('__')
  ? 'v0.8.7'
  : BUILD_HOST_VERSION;

export type ProductPluginPayloadFieldType = 'ui_uri' | 'mime_type' | 'html';

export interface ProductPluginPayloadField {
  name: string;
  type: ProductPluginPayloadFieldType;
  required: boolean;
  maxLength: number;
}

export interface ProductPluginPayloadSchema {
  schemaVersion: 1;
  id: string;
  fields: ProductPluginPayloadField[];
}

export interface ProductPluginManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  status: 'deployed';
  kind: 'product_plugin';
  actions: string[];
  scopes: string[];
  clientPrimitiveId: string;
  minHostVersion: string;
  payloadSchema: ProductPluginPayloadSchema;
}

export interface ProductPluginContract {
  sha256: string;
  manifest: ProductPluginManifest;
}

export class ProductPluginContractError extends Error {
  code = 'PRODUCT_PLUGIN_CONTRACT_INVALID';
}

function contract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ProductPluginContractError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: string[], label: string): Record<string, unknown> {
  contract(isObject(value), `${label} must be an object`);
  const actual = Object.keys(value);
  const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  const unknown = actual.filter((key) => !keys.includes(key));
  contract(missing.length === 0 && unknown.length === 0, `${label} fields mismatch`);
  return value;
}

function validatePayloadSchema(value: unknown): ProductPluginPayloadSchema {
  const schema = exactKeys(value, ['schemaVersion', 'id', 'fields'], 'plugin payload schema');
  contract(schema.schemaVersion === 1, 'plugin payload schema.schemaVersion must be 1');
  contract(
    typeof schema.id === 'string' && ID_PATTERN.test(schema.id),
    'plugin payload schema.id is invalid',
  );
  contract(
    Array.isArray(schema.fields) && schema.fields.length > 0,
    'plugin payload schema.fields is required',
  );
  const fields = schema.fields.map((value, index) => {
    const field = exactKeys(
      value,
      ['name', 'type', 'required', 'maxLength'],
      `plugin payload schema.fields[${index}]`,
    );
    contract(
      typeof field.name === 'string' && /^[a-z][a-zA-Z0-9]{0,63}$/.test(field.name),
      `plugin payload schema.fields[${index}].name is invalid`,
    );
    contract(
      typeof field.type === 'string' && PAYLOAD_FIELD_TYPES.has(field.type),
      `plugin payload schema.fields[${index}].type is invalid`,
    );
    contract(
      typeof field.required === 'boolean',
      `plugin payload schema.fields[${index}].required is invalid`,
    );
    contract(
      Number.isInteger(field.maxLength) &&
        Number(field.maxLength) >= 1 &&
        Number(field.maxLength) <= 200_000,
      `plugin payload schema.fields[${index}].maxLength is invalid`,
    );
    return {
      name: field.name,
      type: field.type as ProductPluginPayloadFieldType,
      required: field.required,
      maxLength: Number(field.maxLength),
    };
  });
  contract(
    new Set(fields.map((field) => field.name)).size === fields.length,
    'plugin payload schema.fields has duplicates',
  );
  return { schemaVersion: 1, id: schema.id, fields };
}

export function validateProductPluginManifest(value: unknown): ProductPluginManifest {
  const manifest = exactKeys(
    value,
    [
      'schemaVersion',
      'id',
      'version',
      'status',
      'kind',
      'actions',
      'scopes',
      'clientPrimitiveId',
      'minHostVersion',
      'payloadSchema',
    ],
    'plugin manifest',
  );
  contract(manifest.schemaVersion === 1, 'plugin manifest.schemaVersion must be 1');
  contract(
    typeof manifest.id === 'string' && ID_PATTERN.test(manifest.id),
    'plugin manifest.id is invalid',
  );
  contract(
    typeof manifest.version === 'string' && VERSION_PATTERN.test(manifest.version),
    'plugin manifest.version is invalid',
  );
  contract(manifest.status === 'deployed', 'plugin manifest.status must be deployed');
  contract(manifest.kind === 'product_plugin', 'plugin manifest.kind must be product_plugin');
  contract(Array.isArray(manifest.actions), 'plugin manifest.actions must be an array');
  const actions = manifest.actions.map((action, index) => {
    contract(
      typeof action === 'string' && ACTION_ID_PATTERN.test(action),
      `plugin manifest.actions[${index}] is invalid`,
    );
    return action;
  });
  contract(new Set(actions).size === actions.length, 'plugin manifest.actions has duplicates');
  contract(Array.isArray(manifest.scopes), 'plugin manifest.scopes must be an array');
  const scopes = manifest.scopes.map((scope, index) => {
    contract(
      typeof scope === 'string' && DATA_SCOPES.has(scope),
      `plugin manifest.scopes[${index}] is invalid`,
    );
    return scope;
  });
  contract(new Set(scopes).size === scopes.length, 'plugin manifest.scopes has duplicates');
  contract(
    typeof manifest.clientPrimitiveId === 'string' && ID_PATTERN.test(manifest.clientPrimitiveId),
    'plugin manifest.clientPrimitiveId is invalid',
  );
  contract(
    typeof manifest.minHostVersion === 'string' &&
      HOST_VERSION_PATTERN.test(manifest.minHostVersion),
    'plugin manifest.minHostVersion is invalid',
  );
  return {
    schemaVersion: 1,
    id: manifest.id,
    version: manifest.version,
    status: 'deployed',
    kind: 'product_plugin',
    actions,
    scopes,
    clientPrimitiveId: manifest.clientPrimitiveId,
    minHostVersion: manifest.minHostVersion,
    payloadSchema: validatePayloadSchema(manifest.payloadSchema),
  };
}

const MCP_UI_RESOURCE_PAYLOAD_SCHEMA = Object.freeze({
  schemaVersion: 1,
  id: 'mcp-ui-resource-payload',
  fields: Object.freeze([
    Object.freeze({ name: 'uri', type: 'ui_uri', required: true, maxLength: 256 }),
    Object.freeze({ name: 'mimeType', type: 'mime_type', required: true, maxLength: 64 }),
    Object.freeze({ name: 'text', type: 'html', required: true, maxLength: 200_000 }),
  ]),
});

export const PRODUCT_CLIENT_PRIMITIVE_REGISTRY = Object.freeze({
  'mcp-ui-resource': Object.freeze({
    pluginId: 'mcp-ui-resource',
    pluginVersion: 'v1',
    payloadSchema: MCP_UI_RESOURCE_PAYLOAD_SCHEMA,
  }),
});

function versionParts(value: string, label: string): number[] {
  contract(HOST_VERSION_PATTERN.test(value), `${label} is invalid`);
  return value.replace(/^v/, '').split('.').map(Number);
}

export function compareHostVersions(left: string, right: string): number {
  const leftParts = versionParts(left, 'host version');
  const rightParts = versionParts(right, 'minimum host version');
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }
  return 0;
}

export function assertProductPluginSupportedByHost(
  value: unknown,
  hostVersion = PRODUCT_HOST_VERSION,
): ProductPluginManifest {
  const manifest = validateProductPluginManifest(value);
  const primitive =
    PRODUCT_CLIENT_PRIMITIVE_REGISTRY[
      manifest.clientPrimitiveId as keyof typeof PRODUCT_CLIENT_PRIMITIVE_REGISTRY
    ];
  contract(Boolean(primitive), `client primitive ${manifest.clientPrimitiveId} is not registered`);
  contract(
    primitive.pluginId === manifest.id && primitive.pluginVersion === manifest.version,
    `client primitive ${manifest.clientPrimitiveId} plugin identity mismatch`,
  );
  contract(
    compareHostVersions(hostVersion, manifest.minHostVersion) >= 0,
    `client primitive ${manifest.clientPrimitiveId} requires host ${manifest.minHostVersion}`,
  );
  contract(
    JSON.stringify(manifest.payloadSchema) === JSON.stringify(primitive.payloadSchema),
    `client primitive ${manifest.clientPrimitiveId} payload schema mismatch`,
  );
  return manifest;
}

function requiredPayloadText(
  value: unknown,
  label: string,
  maxLength: number,
  options: { nonEmpty?: boolean; rejectControlCharacters?: boolean } = {},
): string {
  contract(typeof value === 'string', `${label} must be a string`);
  contract(!options.nonEmpty || value.length > 0, `${label} is required`);
  contract(value.length <= maxLength, `${label} exceeds ${maxLength} characters`);
  contract(
    !options.rejectControlCharacters ||
      !Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      }),
    `${label} contains control characters`,
  );
  return value;
}

/** Validates the external MCP UI payload and drops all fields not consumed by the renderer. */
export function sanitizeMCPUIResource(value: unknown): UIResource {
  contract(isObject(value), 'MCP UI resource must be an object');
  const resourceId = requiredPayloadText(value.resourceId, 'MCP UI resource.resourceId', 128, {
    nonEmpty: true,
    rejectControlCharacters: true,
  });
  const uri = requiredPayloadText(value.uri, 'MCP UI resource.uri', 256, {
    nonEmpty: true,
    rejectControlCharacters: true,
  });
  contract(UI_URI_PATTERN.test(uri), 'MCP UI resource.uri must use ui://');
  const mimeType = requiredPayloadText(value.mimeType, 'MCP UI resource.mimeType', 64, {
    nonEmpty: true,
    rejectControlCharacters: true,
  });
  contract(mimeType === 'text/html', 'MCP UI resource.mimeType must be text/html');
  const text = requiredPayloadText(value.text, 'MCP UI resource.text', 200_000);
  return { resourceId, uri, mimeType, text };
}

export function trySanitizeMCPUIResource(value: unknown): UIResource | undefined {
  try {
    return sanitizeMCPUIResource(value);
  } catch {
    return undefined;
  }
}
