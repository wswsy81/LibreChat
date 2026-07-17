import type { UIResource } from 'librechat-data-provider';

const ONE_SHOT_RESOURCE_URIS = new Set(['ui://future-lines/topics']);

/**
 * Topic pickers are inputs, not historical artifacts. Once their assistant
 * message is no longer the latest message, a later turn has already answered
 * or superseded them. Reports, archive panels, and other resources remain.
 */
export function shouldRenderUIResource(resource: UIResource, isLatestMessage?: boolean): boolean {
  return !ONE_SHOT_RESOURCE_URIS.has(resource.uri) || isLatestMessage !== false;
}
