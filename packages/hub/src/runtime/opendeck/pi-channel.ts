/**
 * OpenDeck property-inspector compatibility path.
 *
 * OpenDeck mounts every action's property inspector iframe hidden at startup
 * and sends `propertyInspectorDidAppear` only when the user opens the panel.
 * The inspector's early runtime-connection ping therefore arrives while the
 * Stream Deck SDK's UIController has no "current" action, and the SDK drops
 * `ui.sendToPropertyInspector` in that state, leaving the inspector's "plugin
 * engine is not responding" notice up permanently.
 *
 * Replying through the ping event's own action context fixes this, but the SDK
 * offers no public context-addressed send. This module is the single scoped
 * exception: it imports the SDK's internal connection singleton by file path
 * (the package exports map blocks the subpath; rollup inlines it to the same
 * module instance the SDK itself uses). Keep every use behind
 * `isOpenDeckPropertyInspectorHost` so normal Stream Deck behavior is
 * untouched.
 *
 * This path is permanent: OpenDeck keeps its lifecycle by design
 * (nekename/OpenDeck#449, closed as not planned). The SDK range in
 * package.json is pinned to a minor version because the import below reaches
 * into the SDK's private dist layout; re-check it on every SDK bump.
 */
import { connection } from "../../../node_modules/@elgato/streamdeck/dist/plugin/connection.js";
import type { SendToPropertyInspector } from "../../../node_modules/@elgato/streamdeck/dist/api/command.js";

/**
 * Reports whether the plugin process runs under OpenDeck.
 *
 * OpenDeck is the only Stream Deck host on Linux. Its registration info
 * cannot be used for this check: OpenDeck hardcodes `platform: "windows"`
 * into the `-info` payload of Node plugin processes (plugins/mod.rs passes a
 * constant `true` to info_param::make_info in the Node branch), so the real
 * `process.platform` is the only reliable signal. Property inspector iframes
 * do see `application.platform` as "linux".
 */
export function isOpenDeckPropertyInspectorHost(platform: NodeJS.Platform = process.platform): boolean {
    return platform === "linux";
}

/**
 * Sends a payload to the property inspector of one specific action.
 *
 * Bypasses the SDK's current-action gate so a reply reaches the inspector
 * that asked, even while OpenDeck keeps it mounted hidden.
 */
export async function sendToPropertyInspectorViaActionContext(
    actionContextId: string,
    payload: SendToPropertyInspector["payload"],
): Promise<void> {
    await connection.send({
        event: "sendToPropertyInspector",
        context: actionContextId,
        payload,
    });
}

/** Property-inspector reply channel with a test seam for the OpenDeck path. */
export interface OpenDeckPropertyInspectorChannel {
    isHost(): boolean;
    sendToAction(actionContextId: string, payload: SendToPropertyInspector["payload"]): Promise<void>;
}

export const defaultOpenDeckPropertyInspectorChannel: OpenDeckPropertyInspectorChannel = {
    isHost: () => isOpenDeckPropertyInspectorHost(),
    sendToAction: (actionContextId, payload) =>
        sendToPropertyInspectorViaActionContext(actionContextId, payload),
};
