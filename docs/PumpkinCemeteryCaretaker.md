# Pumpkin Cemetery Caretaker

File: `cb_PumpkinCemeteryCaretaker.js`

Current version: **0.2.9**

Pumpkin Cemetery Caretaker adds **CB Pumpkin Cemetery Caretaker** to the client's Tools menu. It locates Noble, Common and Small Pumpkin Cemeteries on the currently viewed island, helps you navigate between them and provides controlled refill tools.

## Features

- Finds pumpkin cemeteries on your own island and friends' islands.
- Centres the map on a selected cemetery.
- Shows current cemetery deposits and available pumpkin refills.
- Accepts either an amount to add or a desired total.
- Can apply a refill to one cemetery, all prepared cemeteries or cemeteries of the same type.
- Spaces multiple refill actions by a random one-to-three-second delay.
- Limits each field and each adding run to a maximum top-up of 1,000 pumpkins.
- Verifies refill results using server responses and refreshed client data.
- Does not automatically retry an unconfirmed refill request.
- Remembers refill choices and selected display options between islands.

## Using the script

1. Install `cb_PumpkinCemeteryCaretaker.js` using the instructions in the repository README.
2. Start the game client and open an island containing pumpkin cemeteries.
3. Open the **Tools** menu and select **CB Pumpkin Cemetery Caretaker**.
4. Use **Navigation** to select and centre the map on a cemetery.
5. Use **Refilling** to review deposits and enter an **Add** or **Total** value.
6. Check the displayed values carefully before applying an individual refill or selecting **Add all**.

Use **Refresh** to reread local client data. Use **Refresh from server** when you need the latest confirmed cemetery amounts from the game server.

## Important safety behaviour

- Negative, invalid or excessive values are not sent.
- A single field cannot add more than 1,000 pumpkins.
- One adding run cannot add more than 1,000 pumpkins in total.
- Remaining queued refills are cancelled if the island changes, the server rejects a request or the result cannot be confirmed.
- An uncertain refill is paused rather than repeated, helping prevent accidental duplicate use of refill items.

## Limitations

- Refilling depends on the client and server allowing the selected cemetery to receive the chosen item.
- Internal client interfaces can change after a client or game update, requiring the script to be updated.
- Always confirm that you are viewing the intended island and cemetery before using refill items.

## Version history

### 0.2.9

- Initial public GitHub release.
- Added cemetery navigation for home and friend islands.
- Added individual, same-type and prepared batch refill controls.
- Added refill limits, delayed batch actions and result verification.
- Added saved choices, local refresh and server refresh controls.
