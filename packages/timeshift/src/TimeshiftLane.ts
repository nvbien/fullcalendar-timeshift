import { Duration, EventStore, EventUiHash, DateMarker, DateSpan, MemoizedRendering, EventInteractionState, EventSegUiInteractionState, DateComponent, ComponentContext, Seg, DateRange, intersectRanges, addMs, DateProfile, memoizeRendering, Slicer } from '@fullcalendar/core'
import { normalizeRange, isValidDate } from './timeshift-date-profile'
import TimeshiftLaneEventRenderer from './TimeshiftLaneEventRenderer'
import TimeshiftLaneFillRenderer from './TimeshiftLaneFillRenderer'
import ShiftAxis from './ShiftAxis'

export interface TimeshiftLaneSeg extends Seg {
  start: DateMarker
  end: DateMarker
}

export interface TimeshiftLaneProps {
  dateProfile: DateProfile
  nextDayThreshold: Duration
  businessHours: EventStore | null
  eventStore: EventStore | null
  eventUiBases: EventUiHash
  dateSelection: DateSpan | null
  eventSelection: string
  eventDrag: EventInteractionState | null
  eventResize: EventInteractionState | null
}

export default class TimeshiftLane extends DateComponent<TimeshiftLaneProps> {

  fgContainerEl: HTMLElement
  timeAxis: ShiftAxis

  private slicer = new TimeshiftLaneSlicer()
  private renderBusinessHours: MemoizedRendering<[ComponentContext, TimeshiftLaneSeg[]]>
  private renderDateSelection: MemoizedRendering<[ComponentContext, TimeshiftLaneSeg[]]>
  private renderBgEvents: MemoizedRendering<[ComponentContext, TimeshiftLaneSeg[]]>
  private renderFgEvents: MemoizedRendering<[ComponentContext, TimeshiftLaneSeg[]]>
  private renderEventSelection: MemoizedRendering<[string]>
  private renderEventDrag = memoizeRendering(this._renderEventDrag, this._unrenderEventDrag)
  private renderEventResize = memoizeRendering(this._renderEventResize, this._unrenderEventResize)


  constructor(fgContainerEl: HTMLElement, bgContainerEl: HTMLElement, timeAxis: ShiftAxis) {
    super(bgContainerEl)

    this.fgContainerEl = fgContainerEl
    this.timeAxis = timeAxis

    let fillRenderer = this.fillRenderer = new TimeshiftLaneFillRenderer(bgContainerEl, timeAxis)
    let eventRenderer = this.eventRenderer = new TimeshiftLaneEventRenderer(fgContainerEl, timeAxis)
    this.mirrorRenderer = new TimeshiftLaneEventRenderer(fgContainerEl, timeAxis)

    this.renderBusinessHours = memoizeRendering(
      fillRenderer.renderSegs.bind(fillRenderer, 'businessHours'),
      fillRenderer.unrender.bind(fillRenderer, 'businessHours')
    )

    this.renderDateSelection = memoizeRendering(
      fillRenderer.renderSegs.bind(fillRenderer, 'highlight'),
      fillRenderer.unrender.bind(fillRenderer, 'highlight')
    )

    this.renderBgEvents = memoizeRendering(
      fillRenderer.renderSegs.bind(fillRenderer, 'bgEvent'),
      fillRenderer.unrender.bind(fillRenderer, 'bgEvent')
    )

    this.renderFgEvents = memoizeRendering(
      eventRenderer.renderSegs.bind(eventRenderer),
      eventRenderer.unrender.bind(eventRenderer)
    )

    this.renderEventSelection = memoizeRendering(
      eventRenderer.selectByInstanceId.bind(eventRenderer),
      eventRenderer.unselectByInstanceId.bind(eventRenderer),
      [ this.renderFgEvents ]
    )
  }


  render(props: TimeshiftLaneProps, context: ComponentContext) {
    let { timeAxis } = this

    let slicedProps = this.slicer.sliceProps(
      props,
      props.dateProfile,
      timeAxis.tDateProfile.isTimeScale ? null : props.nextDayThreshold,
      context.calendar,
      this,
      timeAxis
    )

    this.renderBusinessHours(context, slicedProps.businessHourSegs)
    this.renderDateSelection(context, slicedProps.dateSelectionSegs)
    this.renderBgEvents(context, slicedProps.bgEventSegs)
    this.renderFgEvents(context, slicedProps.fgEventSegs)
    this.renderEventSelection(slicedProps.eventSelection)
    this.renderEventDrag(slicedProps.eventDrag)
    this.renderEventResize(slicedProps.eventResize)
  }


  destroy() {
    super.destroy()

    this.renderBusinessHours.unrender()
    this.renderDateSelection.unrender()
    this.renderBgEvents.unrender()
    this.renderFgEvents.unrender()
    this.renderEventSelection.unrender()
    this.renderEventDrag.unrender()
    this.renderEventResize.unrender()
  }


  _renderEventDrag(state: EventSegUiInteractionState) {
    if (state) {
      this.eventRenderer.hideByHash(state.affectedInstances)
      this.mirrorRenderer.renderSegs(this.context, state.segs, { isDragging: true, sourceSeg: state.sourceSeg })
    }
  }


  _unrenderEventDrag(state: EventSegUiInteractionState) {
    if (state) {
      this.eventRenderer.showByHash(state.affectedInstances)
      this.mirrorRenderer.unrender(this.context, state.segs, { isDragging: true, sourceSeg: state.sourceSeg })
    }
  }


  _renderEventResize(state: EventSegUiInteractionState) {
    if (state) {
      // HACK. eventRenderer and fillRenderer both use these segs. would compete over seg.el
      let segsForHighlight = state.segs.map(function(seg) {
        return { ...seg }
      })

      this.eventRenderer.hideByHash(state.affectedInstances)
      this.fillRenderer.renderSegs('highlight', this.context, segsForHighlight)
      this.mirrorRenderer.renderSegs(this.context, state.segs, { isDragging: true, sourceSeg: state.sourceSeg })
    }
  }


  _unrenderEventResize(state: EventSegUiInteractionState) {
    if (state) {
      this.eventRenderer.showByHash(state.affectedInstances)
      this.fillRenderer.unrender('highlight', this.context)
      this.mirrorRenderer.unrender(this.context, state.segs, { isDragging: true, sourceSeg: state.sourceSeg })
    }
  }


  updateSize(isResize: boolean) {
    let { fillRenderer, eventRenderer, mirrorRenderer } = this

    fillRenderer.computeSizes(isResize)
    eventRenderer.computeSizes(isResize)
    mirrorRenderer.computeSizes(isResize)

    fillRenderer.assignSizes(isResize)
    eventRenderer.assignSizes(isResize)
    mirrorRenderer.assignSizes(isResize)
  }

}


class TimeshiftLaneSlicer extends Slicer<TimeshiftLaneSeg, [ShiftAxis]> {

  sliceRange(origRange: DateRange, timeAxis: ShiftAxis): TimeshiftLaneSeg[] {
    let { tDateProfile } = timeAxis
    let { dateProfile, dateProfileGenerator } = timeAxis.props
    let { dateEnv } = timeAxis.context
    let normalRange = normalizeRange(origRange, tDateProfile, dateEnv)
    let segs: TimeshiftLaneSeg[] = []

    // protect against when the span is entirely in an invalid date region
    if (timeAxis.computeDateSnapCoverage(normalRange.start) < timeAxis.computeDateSnapCoverage(normalRange.end)) {

      // intersect the footprint's range with the grid's range
      let slicedRange = intersectRanges(normalRange, tDateProfile.normalizedRange)

      if (slicedRange) {
        segs.push({
          start: slicedRange.start,
          end: slicedRange.end,
          isStart: slicedRange.start.valueOf() === normalRange.start.valueOf() && isValidDate(slicedRange.start, tDateProfile, dateProfile, dateProfileGenerator),
          isEnd: slicedRange.end.valueOf() === normalRange.end.valueOf() && isValidDate(addMs(slicedRange.end, -1), tDateProfile, dateProfile, dateProfileGenerator)
        })
      }
    }

    return segs
  }

}
