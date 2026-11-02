import { Runtime } from 'foldkit'

import { Message, Model, init, update, view } from './main'
import { subscriptions } from './subscription'

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  devTools: {
    Message,
  },
})

Runtime.run(application)
