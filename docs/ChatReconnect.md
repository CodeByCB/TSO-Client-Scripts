# Chat Reconnect

File: `user_cb_ChatReconnect.js`

Current version: **1.12**

Chat Reconnect adds **CB Chat Reconnect** to the client's Tools menu. Use it when the in-game chat crashed but the rest of the game remains available.

## Using the script

1. Install `user_cb_ChatReconnect.js` using the instructions in the repository README.
2. Start the game client.
3. When in-game chat dropps and is unabel to reconnect, open **Tools** menu and select **CB Chat Reconnect**.
4. Wait a few seconds while the script attempts to restore the connection and chat channels. You can monitor the status in the News tab.

## Limitations

- It cannot repair a server-wide chat outage, scheduled maintenance or a lost game connection.
- Internal client interfaces can change after a client or game update, requiring the script to be updated.
- If chat does not recover, restarting the client may still be necessary.

## Version history

### 1.12

- Added chat health checks and guarded reconnect attempts.
- Added global-channel rejoin and guild-chat repair paths.
- Added relevant friend and chat-interface refresh steps.
