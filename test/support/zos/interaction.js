import { world } from '../world.mjs'

export const showToast = ({ content }) => world.toasts.push(content)
