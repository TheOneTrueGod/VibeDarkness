# Systems

- "Rewind" 5 seconds so you can see the last 5 seconds of what happened
- Facing: enemies have a direction they are facing and turn relatively slowly
- Pause plane timeouts: a host-driven limit on how long a pause plane can wait for a player who is expected to act
  - Today a plane waits as long as it takes. Needed once more than one player can be waited on at once (co-op Reactions, see browser plan 0008)
  - The host must own the clock, not a client timer, so every client agrees when it fired. A timed-out claim passes for the player and costs nothing
  - Open: does a timeout auto-pass the player, or hand the plane back to someone else? Does the limit differ by cause (a Reaction claim versus ordinary ability selection)?
  - Extend the existing stuck-pause handling in `BattleNet` (`waiting_for_host` stall detection) rather than adding a second mechanism
- Mesh link down to the host: a player whose WebRTC link to the host is down needs to be told and helped back
  - The Reaction claim button is disabled while the link is down (browser plan 0008), but a down link is itself a fault that needs resolving, not just hiding
  - Show a clear "connection to host lost" state, retry the link automatically, and decide what the fight does while it is down (keep waiting, time the player out, or fall back to the ordinary order path)
  - Check how this lines up with the existing disconnect indicator and auto-reconnect (see the webrtc-lobby-mesh skill)
- Reflex as an extra turn: spend Reflex to act at **any** other player's pause plane, not only during a Reactable attack
  - The co-op Reaction claim (browser plan 0008) ships limited to "a Reactable attack is in progress"; this widens the same `canClaimReaction` rule
  - Open: does Reflex stay at 1 recovered per round once it buys general extra turns, and does the pace of a fight survive frequent claims?
