import { createPlugin } from '@fullcalendar/core'
import TimeshiftPlugin from '@fullcalendar/timeshift'
import ResourceCommonPlugin from '@fullcalendar/resource-common'
import ResourceTimeshiftView from './ResourceTimeshiftView'
export {  ResourceTimeshiftView }
export default createPlugin({
  deps: [ ResourceCommonPlugin, TimeshiftPlugin ],
  defaultView: 'resourceTimeshiftWeek',
  views: {

    resourceTimeshift: {
      class: ResourceTimeshiftView,
      viewRender: function(view, element) {
        view.title = 'Your Custom Title';
      },
      resourceAreaWidth: '30%',
      resourcesInitiallyExpanded: true,
      eventResizableFromStart: true // TODO: not DRY with this same setting in the main timeshift config
    },

    resourceTimeshiftFourDays: {
      type: 'resourceTimeshift',
      buttonText: '4 days',
      superHeaderText:'4 days',
      slotDuration: { hours: 8},
      slotDurationHr:8,
      duration: { days: 4 }
    },

    resourceShiftView: {
      type: 'resourceTimeshift',
      buttonText: 'Shift',
      superHeaderText:'Shift',
      hideHeaderText: true,
      slotDurationHr:8,
      slotDuration: { minutes: 30},
      duration: { hours: 8 }
    },

    resourceTimeshiftWeek: {
      type: 'resourceTimeshift',
      buttonText: 'Week',
      superHeaderText:'Week',
      slotDurationHr:8,
      duration: { weeks: 1 },
      slotDuration: { hours: 8}
    },
  }
})
