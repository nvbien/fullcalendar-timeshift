import { createPlugin } from '@fullcalendar/core'
import TimeshiftView from './TimeshiftView'

export { TimeshiftView }
export { default as TimeshiftLane } from './TimeshiftLane'
export { default as ScrollJoiner } from './util/ScrollJoiner'
export { default as StickyScroller } from './util/StickyScroller'
export { default as ShiftAxis } from './ShiftAxis'
export { default as HeaderBodyLayout } from './HeaderBodyLayout'

export default createPlugin({
  defaultView: 'timeshiftDay',
  views: {

    timeshift: {
      class: TimeshiftView,
      eventResizableFromStart: false // how is this consumed for TimeshiftView tho?
    },

    timeshiftDay: {
      type: 'timeshift',
      duration: { days: 1 },
    },

    timeshiftWeek: {
      type: 'timeshift',
      duration: { weeks: 1 }
    },

    timeshiftMonth: {
      type: 'timeshift',
      duration: { months: 1 }
    },

    timeshiftYear: {
      type: 'timeshift',
      duration: { years: 1 }
    }

  }
})
