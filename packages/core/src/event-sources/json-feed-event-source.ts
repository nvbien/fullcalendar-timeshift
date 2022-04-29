import requestJson from '../util/requestJson'
import Calendar from '../Calendar'
import { EventSourceDef } from '../structs/event-source'
import { DateRange } from '../datelib/date-range'
import { __assign } from 'tslib'
import { createPlugin } from '../plugin-system'

interface JsonFeedMeta {
  url: string
  method: string
  extraParams?: any
  startParam?: string
  endParam?: string
  timeZoneParam?: string
}

let eventSourceDef: EventSourceDef = {

  parseMeta(raw: any): JsonFeedMeta | null {
    if (typeof raw === 'string') { // short form
      raw = { url: raw }
    } else if (!raw || typeof raw !== 'object' || !raw.url) {
      return null
    }

    return {
      url: raw.url,
      method: (raw.method || 'GET').toUpperCase(),
      extraParams: raw.extraParams,
      startParam: raw.startParam,
      endParam: raw.endParam,
      timeZoneParam: raw.timeZoneParam
    }
  },

  fetch(arg, success, failure) {
    let meta: JsonFeedMeta = arg.eventSource.meta
    console.log('arg.eventSource', JSON.stringify (arg.range),arg)
    let requestParams = buildRequestParams(meta, arg.range, arg.calendar)

    requestJson(
      meta.method, meta.url, requestParams,
      function(rawEvents, xhr) {
        success({ rawEvents, xhr })
      },
      function(errorMessage, xhr) {
        failure({ message: errorMessage, xhr })
      }
    )
  }

}

export default createPlugin({
  eventSourceDefs: [ eventSourceDef ]
})

function buildRequestParams(meta: JsonFeedMeta, range: DateRange, calendar: Calendar) {
  const dateEnv = calendar.dateEnv
  let startParam
  let endParam
  let viewType
  let startHr
  let timeZoneParam
  let customRequestParams
  let params = {}

  startParam = meta.startParam
  if (startParam == null) {
    startParam = calendar.opt('startParam')
  }

  endParam = meta.endParam
  if (endParam == null) {
    endParam = calendar.opt('endParam')
  }

  timeZoneParam = meta.timeZoneParam
  if (timeZoneParam == null) {
    timeZoneParam = calendar.opt('timeZoneParam')
  }
  
  viewType = calendar.state.viewType;
  if(viewType == null){
    viewType = calendar.opt('defaultView');
  }
  console.log('viewType',viewType, calendar.state)
  // retrieve any outbound GET/POST data from the options
  if (typeof meta.extraParams === 'function') {
    // supplied as a function that returns a key/value object
    customRequestParams = meta.extraParams()
  } else {
    // probably supplied as a straight key/value object
    customRequestParams = meta.extraParams || {}
  }

  __assign(params, customRequestParams)
  startHr = range.start.getUTCHours();
  let additionHr = calendar.opt('additionHr');
  if(isNaN(additionHr)){
    additionHr = 0;
  }
  let dif = (startHr - additionHr) % 8;
  if(viewType =='resourceShiftView' && dif != 0) {
    if(dif < 0){
      dif +=8;
    }
    console.log('arg.eventSource', JSON.stringify (range.start), range.start.getHours())
    console.log('test dif', startHr.toString(), dif);
    params[startParam] = dateEnv.formatIso(new Date(range.start.getTime() - dif * 3600000))
    params[endParam] = dateEnv.formatIso(new Date(range.end.getTime() - dif * 3600000))
  }
  else{
    params[startParam] = dateEnv.formatIso(range.start)
    params[endParam] = dateEnv.formatIso(range.end)
  }
  console.log('params', JSON.stringify(params))
  if (dateEnv.timeZone !== 'local') {
    params[timeZoneParam] = dateEnv.timeZone
  }

  return params
}
