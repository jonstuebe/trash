import { Runtime } from 'foldkit'

import {
  Flags,
  Message,
  Model,
  flags,
  init,
  managedResources,
  update,
  view,
} from './main'
import { subscriptions } from './subscription'

// iOS Safari ignores user-scalable=no, so pinch zoom is blocked here too.
for (const gesture of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(gesture, event => event.preventDefault(), {
    passive: false,
  })
}

const application = Runtime.makeApplication({
  Model,
  Flags,
  init,
  update,
  view,
  subscriptions,
  managedResources,
  container: document.getElementById('root'),
  devTools: {
    Message,
  },
})

Runtime.run(application, { flags })
