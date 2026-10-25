// Host session/data adapters are intentionally absent: fail closed, not a
// public API-key relay. Mount createShadowHandler with trusted adapters later.
import { createShadowHandler } from '../server/shadow-handler.mjs'
export default createShadowHandler()
