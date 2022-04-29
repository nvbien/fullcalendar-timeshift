import { ElementDragging, SplittableProps, memoizeRendering, PositionCache, Hit, View, createElement, parseFieldSpecs, ComponentContext, memoize, DateProfile, 
  applyStyleProp, PointerDragEvent, Duration, DateProfileGenerator, createFormatter, diffWholeDays } from '@fullcalendar/core'
import { ScrollJoiner, TimeshiftLane, StickyScroller, ShiftAxis } from '@fullcalendar/timeshift'
// import { ShiftAxis } from '@fullcalendar/timeshift'
import { ResourceHash, buildRowNodes, GroupNode, ResourceNode, ResourceViewProps, ResourceSplitter, buildResourceTextFunc } from '@fullcalendar/resource-common'
import GroupRow from './GroupRow'
import ResourceRow from './ResourceRow'
import Spreadsheet from './Spreadsheet'
import { __assign } from 'tslib'

const MIN_RESOURCE_AREA_WIDTH = 30 // definitely bigger than scrollbars

export default class ResourceTimeshiftView extends View {

  static needsResourceData = true // for ResourceViewProps
  props: ResourceViewProps

  // child components
  spreadsheet: Spreadsheet
  shiftAxis: ShiftAxis
  lane: TimeshiftLane
  bodyScrollJoiner: ScrollJoiner
  spreadsheetBodyStickyScroller: StickyScroller
  isStickyScrollDirty = false

  shiftAxisTbody: HTMLElement
  miscHeight: number
  rowNodes: (GroupNode | ResourceNode)[] = []
  rowComponents: (GroupRow | ResourceRow)[] = []
  rowComponentsById: { [id: string]: (GroupRow | ResourceRow) } = {}

  resourceAreaHeadEl: HTMLElement
  resourceAreaWidth?: number
  resourceAreaWidthDraggings: ElementDragging[] = []

  // internal state
  superHeaderText: any
  superText3rdLine: any
  superText2ndLine: any
  isVGrouping: any
  isHGrouping: any
  groupSpecs: any
  colSpecs: any
  orderSpecs: any

  rowPositions: PositionCache

  private splitter = new ResourceSplitter() // doesn't let it do businessHours tho
  private renderSkeleton = memoizeRendering(this._renderSkeleton, this._unrenderSkeleton)
  private hasResourceBusinessHours = memoize(hasResourceBusinessHours)
  private buildRowNodes = memoize(buildRowNodes)
  private hasNesting = memoize(hasNesting)
  private updateHasNesting = memoizeRendering(this._updateHasNesting)
  private startInteractive = memoizeRendering(this._startInteractive, this._stopInteractive)


  _startInteractive(shiftAxisEl: HTMLElement) {
    this.context.calendar.registerInteractiveComponent(this, { el: shiftAxisEl })
  }


  _stopInteractive() {
    this.context.calendar.unregisterInteractiveComponent(this)
  }

  render(props: ResourceViewProps, context: ComponentContext) {
    super.render(props, context);
    const cContext = Object.assign({}, context);
    let additionHr = 0;
    if('additionHr' in cContext.options){
      console.log('before change', JSON.stringify(props.dateProfile), additionHr);
      additionHr = parseInt(cContext.options.additionHr);

      if('slotDurationHr' in cContext.options){
        if(additionHr < 0){
          additionHr = additionHr % parseInt(cContext.options.slotDurationHr) + parseInt(cContext.options.slotDurationHr);
        }
        cContext.options.additionHr = additionHr;
        // if(props.dateProfile.currentRangeUnit =='hour'){
          let currentHr = props.dateProfile.renderRange.start.getUTCHours();
          if(additionHr <= currentHr){
            additionHr += Math.floor(currentHr / (cContext.options.slotDurationHr + additionHr)) * cContext.options.slotDurationHr - currentHr + 1 ;
            if(additionHr + cContext.options.slotDurationHr < 2){
              additionHr += cContext.options.slotDurationHr;
            }
          }
          else{
              additionHr -= cContext.options.slotDurationHr + currentHr - 1; 
          }
          // if(cContext.options.timeZone =='UTC'){
          //   additionHr -= 1;
          // }
          props.dateProfile.minTime.milliseconds = (additionHr - 1) *60*60*1000;
          props.dateProfile.maxTime.milliseconds = (additionHr - 1 + 24 )*60*60*1000;
          cContext.options.minTime = props.dateProfile.minTime;
          cContext.options.maxTime = props.dateProfile.maxTime;
          // calculate range
          const start = new Date(props.dateProfile.activeRange.start.getTime() - (cContext.options.slotDurationHr - 7) * 3600000);
          const end = new Date(props.dateProfile.activeRange.end.getTime() - (cContext.options.slotDurationHr - 7) * 3600000);
          
          props.dateProfile.activeRange.start = start;
          props.dateProfile.activeRange.end = end;
          
          props.dateProfile.currentRange.start = start;
          props.dateProfile.currentRange.end = end;
          
          props.dateProfile.validRange.start = start;
          props.dateProfile.validRange.end = end;
          
          // props.dateProfile.renderRange.start = start;
          // props.dateProfile.renderRange.end = start;

          document.querySelector('.fc-toolbar > div > h2').innerHTML =
          cContext.dateEnv.formatRange(
            start,
            end,
            createFormatter(
              cContext.options.titleFormat || computeTitleFormat(props.dateProfile),
              cContext.options.titleRangeSeparator
            )
          );
        }
        else{
          props.dateProfile.minTime.milliseconds = (additionHr - 1) *60*60*1000;
          props.dateProfile.maxTime.milliseconds = (additionHr - 1 + 24 )*60*60*1000;
          cContext.options.minTime = props.dateProfile.minTime;
          cContext.options.maxTime = props.dateProfile.maxTime;
          additionHr = 0;
        }
        // additionHr = additionHr % parseInt(cContext.options.slotDurationHr);
      }
      // console.log('current hour', new Date(), props.dateProfile, additionHr);
      if(cContext.options.timeZone =='local'){
          additionHr = 0;
      }
      else{
        additionHr = getTimezoneOffset(this.context.options.timeZone)/60;
      }
      // props.dateProfile.defautDate.setHours(0,0,0,0);
    
      // this.context = context;
    // }
    this.renderSkeleton(cContext)

    let splitProps = this.splitter.splitProps(props)
    let hasResourceBusinessHours = this.hasResourceBusinessHours(props.resourceStore)

    this.spreadsheet.receiveProps({
      superHeaderText: this.superHeaderText,
      superHeader2ndLine: this.superText2ndLine,
      superHeader3rdLine: this.superText3rdLine,
      colSpecs: this.colSpecs
    }, context)

    this.shiftAxis.receiveProps({
      dateProfileGenerator: props.dateProfileGenerator,
      dateProfile: props.dateProfile
    }, context)

    this.startInteractive(this.shiftAxis.slats.el)

    // for all-resource bg events / selections / business-hours
    this.lane.receiveProps({
      ...splitProps[''],
      dateProfile: props.dateProfile,
      nextDayThreshold: context.nextDayThreshold,
      businessHours: hasResourceBusinessHours ? null : props.businessHours
    }, context)

    let newRowNodes = this.buildRowNodes(
      props.resourceStore,
      this.groupSpecs,
      this.orderSpecs,
      this.isVGrouping,
      props.resourceEntityExpansions,
      context.options.resourcesInitiallyExpanded
    )

    this.updateHasNesting(this.hasNesting(newRowNodes))

    this.diffRows(newRowNodes)
    this.updateRowProps(
      props.dateProfile,
      hasResourceBusinessHours ? props.businessHours : null, // CONFUSING, comment
      splitProps,
      additionHr
    )

    console.log('after change', JSON.stringify(props.dateProfile), additionHr);
    
    this.startNowIndicator(props.dateProfile, props.dateProfileGenerator)
  }


  _renderSkeleton(context: ComponentContext) {
    let { options, calendar } = context
    let allColSpecs = options.resourceColumns || []
    let labelText = options.resourceLabelText // TODO: view.override
    this.superText2ndLine = options.resourceLabelTextSecondLine // TODO: view.override
    this.superText3rdLine = options.resourceLabelTextThirdLine // TODO: view.override
    let defaultLabelText = 'Resources' // TODO: view.defaults
    let superHeaderText = null

    if (!allColSpecs.length) {
      allColSpecs.push({
        labelText: labelText || defaultLabelText,
        text: buildResourceTextFunc(options.resourceText, calendar)
      })
    } else {
      superHeaderText = labelText
    }

    const plainColSpecs = []
    const groupColSpecs = []
    let groupSpecs = []
    let isVGrouping = false
    let isHGrouping = false

    for (let colSpec of allColSpecs) {
      if (colSpec.group) {
        groupColSpecs.push(colSpec)
      } else {
        plainColSpecs.push(colSpec)
      }
    }

    plainColSpecs[0].isMain = true

    if (groupColSpecs.length) {
      groupSpecs = groupColSpecs
      isVGrouping = true
    } else {
      const hGroupField = options.resourceGroupField
      if (hGroupField) {
        isHGrouping = true
        groupSpecs.push({
          field: hGroupField,
          text: options.resourceGroupText,
          render: options.resourceGroupRender
        })
      }
    }

    const allOrderSpecs = parseFieldSpecs(options.resourceOrder)
    const plainOrderSpecs = []

    for (let orderSpec of allOrderSpecs) {
      let isGroup = false
      for (let groupSpec of groupSpecs) {
        if (groupSpec.field === orderSpec.field) {
          groupSpec.order = orderSpec.order // -1, 0, 1
          isGroup = true
          break
        }
      }
      if (!isGroup) {
        plainOrderSpecs.push(orderSpec)
      }
    }

    this.superHeaderText = superHeaderText
    this.isVGrouping = isVGrouping
    this.isHGrouping = isHGrouping
    this.groupSpecs = groupSpecs
    this.colSpecs = groupColSpecs.concat(plainColSpecs)
    this.orderSpecs = plainOrderSpecs

    // START RENDERING...

    this.el.classList.add('fc-timeshift')

    if (options.eventOverlap === false) {
      this.el.classList.add('fc-no-overlap')
    }

    this.el.innerHTML = this.renderSkeletonHtml()

    this.resourceAreaHeadEl = this.el.querySelector('thead .fc-resource-area')
    this.setResourceAreaWidth(options.resourceAreaWidth)
    this.initResourceAreaWidthDragging()

    this.miscHeight = this.el.getBoundingClientRect().height

    this.spreadsheet = new Spreadsheet(
      this.resourceAreaHeadEl,
      this.el.querySelector('tbody .fc-resource-area')
    )

    this.shiftAxis = new ShiftAxis(
      this.el.querySelector('thead .fc-time-area'),
      this.el.querySelector('tbody .fc-time-area')
    )

    let shiftAxisRowContainer = createElement('div', { className: 'fc-rows' }, '<table><tbody /></table>')
    this.shiftAxis.layout.bodyScroller.enhancedScroll.canvas.contentEl.appendChild(shiftAxisRowContainer)
    this.shiftAxisTbody = shiftAxisRowContainer.querySelector('tbody')

    this.lane = new TimeshiftLane(
      null,
      this.shiftAxis.layout.bodyScroller.enhancedScroll.canvas.bgEl,
      this.shiftAxis
    )

    this.bodyScrollJoiner = new ScrollJoiner('vertical', [
      this.spreadsheet.layout.bodyScroller,
      this.shiftAxis.layout.bodyScroller
    ])

    // after scrolljoiner
    this.spreadsheetBodyStickyScroller = new StickyScroller(
      this.spreadsheet.layout.bodyScroller.enhancedScroll,
      context.isRtl,
      true // isVertical
    )
  }


  _unrenderSkeleton(context: ComponentContext) {
    this.startInteractive.unrender() // "unrender" bad name

    this.destroyRows() // wierd to call this here

    this.spreadsheet.destroy()
    this.shiftAxis.destroy()
    this.lane.destroy()
    this.spreadsheetBodyStickyScroller.destroy()

    this.el.classList.remove('fc-timeshift')
    this.el.classList.remove('fc-no-overlap')
  }


  renderSkeletonHtml() {
    let { theme } = this.context

    return `<table class="` + theme.getClass('tableGrid') + `"> \
<thead class="fc-head"> \
<tr> \
<td class="fc-resource-area ` + theme.getClass('widgetHeader') + `"></td> \
<td class="fc-divider fc-col-resizer ` + theme.getClass('widgetHeader') + `"></td> \
<td class="fc-time-area ` + theme.getClass('widgetHeader') + `"></td> \
</tr> \
</thead> \
<tbody class="fc-body"> \
<tr> \
<td class="fc-resource-area ` + theme.getClass('widgetContent') + `"></td> \
<td class="fc-divider fc-col-resizer ` + theme.getClass('widgetHeader') + `"></td> \
<td class="fc-time-area ` + theme.getClass('widgetContent') + `"></td> \
</tr> \
</tbody> \
</table>`
  }


  _updateHasNesting(isNesting: boolean) {
    let { classList } = this.el

    if (isNesting) {
      classList.remove('fc-flat')
    } else {
      classList.add('fc-flat')
    }
  }


  diffRows(newNodes) {
    let oldNodes = this.rowNodes
    let oldLen = oldNodes.length
    let oldIndexHash = {} // id -> index
    let oldI = 0
    let newI = 0

    for (oldI = 0; oldI < oldLen; oldI++) {
      oldIndexHash[oldNodes[oldI].id] = oldI
    }

    // iterate new nodes
    for (oldI = 0, newI = 0; newI < newNodes.length; newI++) {
      let newNode = newNodes[newI]
      let oldIFound = oldIndexHash[newNode.id]

      if (oldIFound != null && oldIFound >= oldI) {
        this.removeRows(newI, oldIFound - oldI, oldNodes) // won't do anything if same index
        oldI = oldIFound + 1
      } else {
        this.addRow(newI, newNode)
      }
    }

    // old rows that weren't found need to be removed
    this.removeRows(newI, oldLen - oldI, oldNodes) // won't do anything if same index

    this.rowNodes = newNodes
  }


  /*
  rowComponents is the in-progress result
  */
  addRow(index, rowNode) {
    let { rowComponents, rowComponentsById } = this

    let nextComponent = rowComponents[index]
    let newComponent = this.buildChildComponent(
      rowNode,
      this.spreadsheet.bodyTbody,
      nextComponent ? nextComponent.spreadsheetTr : null,
      this.shiftAxisTbody,
      nextComponent ? nextComponent.timeAxisTr : null
    )

    rowComponents.splice(index, 0, newComponent)
    rowComponentsById[rowNode.id] = newComponent
  }


  removeRows(startIndex, len, oldRowNodes) {
    if (len) {
      let { rowComponents, rowComponentsById } = this

      for (let i = 0; i < len; i++) {
        let rowComponent = rowComponents[startIndex + i]

        rowComponent.destroy()

        delete rowComponentsById[oldRowNodes[i].id]
      }

      rowComponents.splice(startIndex, len)
    }
  }


  buildChildComponent(
    node: (GroupNode | ResourceNode),
    spreadsheetTbody: HTMLElement,
    spreadsheetNext: HTMLElement,
    shiftAxisTbody: HTMLElement,
    shiftAxisNext: HTMLElement
  ) {
    if ((node as GroupNode).group) {
      return new GroupRow(
        spreadsheetTbody,
        spreadsheetNext,
        shiftAxisTbody,
        shiftAxisNext
      )
    } else if ((node as ResourceNode).resource) {
      return new ResourceRow(
        spreadsheetTbody,
        spreadsheetNext,
        shiftAxisTbody,
        shiftAxisNext,
        this.shiftAxis
      )
    }
  }


  updateRowProps(
    dateProfile: DateProfile,
    fallbackBusinessHours,
    splitProps: { [resourceId: string]: SplittableProps },
    additionHr = 0
  ) {
    let { rowNodes, rowComponents, context } = this

    for (let i = 0; i < rowNodes.length; i++) {
      let rowNode = rowNodes[i]
      let rowComponent = rowComponents[i]

      if ((rowNode as GroupNode).group) {
        (rowComponent as GroupRow).receiveProps({
          spreadsheetColCnt: this.colSpecs.length,
          id: rowNode.id,
          isExpanded: rowNode.isExpanded,
          group: (rowNode as GroupNode).group
        }, context)
      } else {
        let resource = (rowNode as ResourceNode).resource
        // let props = Object.assign({}, splitProps[resource.id]);
        let props = JSON.parse(JSON.stringify(splitProps[resource.id]));
        // console.log('updated event',i, props, typeof props['eventStore']['instances']);
        if(additionHr != 0 &&  typeof props['eventStore']['instances'] == 'object'){
          for(const [key, value] of Object.entries(props.eventStore.instances))
          {
            value['range']['start'] = new Date(Date.parse(value['range']['start']) - additionHr * 3600000);
            value['range']['end'] = new Date(Date.parse(value['range']['end']) - additionHr * 3600000);
            props.eventStore.instances[key] = value;
          }
        }
        else{
          props = splitProps[resource.id];
        }
        if(i == 11){
          console.log('updated event',i, props, splitProps[resource.id]);
        }
        ;(rowComponent as ResourceRow).receiveProps({
          ...props,
          dateProfile,
          nextDayThreshold: context.nextDayThreshold,
          businessHours: resource.businessHours || fallbackBusinessHours,
          colSpecs: this.colSpecs,
          id: rowNode.id,
          rowSpans: (rowNode as ResourceNode).rowSpans,
          depth: (rowNode as ResourceNode).depth,
          isExpanded: rowNode.isExpanded,
          hasChildren: (rowNode as ResourceNode).hasChildren,
          resource: (rowNode as ResourceNode).resource
        }, context)
      }
    }
  }


  updateSize(isResize, viewHeight, isAuto) {
    // FYI: this ordering is really important

    let { calendar } = this.context

    let isBaseSizing = isResize || calendar.isViewUpdated || calendar.isDatesUpdated || calendar.isEventsUpdated

    if (isBaseSizing) {
      this.syncHeadHeights()
    }

    // TODO: don't always call these (but guarding behind isBaseSizing was unreliable)
    this.shiftAxis.updateSize(isResize, viewHeight - this.miscHeight, isAuto)
    this.spreadsheet.updateSize(isResize, viewHeight - this.miscHeight, isAuto)

    let rowSizingCnt = this.updateRowSizes(isResize)

    this.lane.updateSize(isResize) // is efficient. uses flags

    if (isBaseSizing || rowSizingCnt) {
      this.bodyScrollJoiner.update()
      this.shiftAxis.layout.scrollJoiner.update() // hack

      this.rowPositions = new PositionCache(
        this.shiftAxis.slats.el,
        this.rowComponents.map(function(rowComponent) {
          return rowComponent.timeAxisTr
        }),
        false, // isHorizontal
        true // isVertical
      )
      this.rowPositions.build()

      this.isStickyScrollDirty = true
    }
  }


  syncHeadHeights() {
    let spreadsheetHeadEl = this.spreadsheet.header.tableEl
    let shiftAxisHeadEl = this.shiftAxis.header.tableEl

    spreadsheetHeadEl.style.height = ''
    shiftAxisHeadEl.style.height = ''

    let max = Math.max(
      spreadsheetHeadEl.getBoundingClientRect().height,
      shiftAxisHeadEl.getBoundingClientRect().height
    )

    spreadsheetHeadEl.style.height =
      shiftAxisHeadEl.style.height = max + 'px'
  }


  updateRowSizes(isResize: boolean): number { // mainly syncs row heights
    let dirtyRowComponents = this.rowComponents

    if (!isResize) {
      dirtyRowComponents = dirtyRowComponents.filter(function(rowComponent) {
        return rowComponent.isSizeDirty
      })
    }

    let elArrays = dirtyRowComponents.map(function(rowComponent) {
      return rowComponent.getHeightEls()
    })

    // reset to natural heights
    for (let elArray of elArrays) {
      for (let el of elArray) {
        el.style.height = ''
      }
    }

    // let rows update their contents' heights
    for (let rowComponent of dirtyRowComponents) {
      rowComponent.updateSize(isResize) // will reset isSizeDirty
    }

    let maxHeights = elArrays.map(function(elArray) {
      let maxHeight = null

      for (let el of elArray) {
        let height = el.getBoundingClientRect().height

        if (maxHeight === null || height > maxHeight) {
          maxHeight = height
        }
      }

      return maxHeight
    })

    for (let i = 0; i < elArrays.length; i++) {
      for (let el of elArrays[i]) {
        el.style.height = maxHeights[i] + 'px'
      }
    }

    return dirtyRowComponents.length
  }


  destroyRows() {
    for (let rowComponent of this.rowComponents) {
      rowComponent.destroy()
    }

    this.rowNodes = []
    this.rowComponents = []
  }


  destroy() {

    for (let resourceAreaWidthDragging of this.resourceAreaWidthDraggings) {
      resourceAreaWidthDragging.destroy()
    }

    this.renderSkeleton.unrender() // will call destroyRows

    super.destroy()
  }


  // Now Indicator
  // ------------------------------------------------------------------------------------------


  getNowIndicatorUnit(dateProfile: DateProfile, dateProfileGenerator: DateProfileGenerator) {
    return this.shiftAxis.getNowIndicatorUnit(dateProfile, dateProfileGenerator)
  }


  renderNowIndicator(date) {
    this.shiftAxis.renderNowIndicator(date)
  }


  unrenderNowIndicator() {
    this.shiftAxis.unrenderNowIndicator()
  }


  // Scrolling
  // ------------------------------------------------------------------------------------------------------------------
  // this is useful for scrolling prev/next dates while resource is scrolled down


  queryScroll() {
    let scroll = super.queryScroll()

    if (this.props.resourceStore) {
      __assign(scroll, this.queryResourceScroll())
    }

    return scroll
  }


  applyScroll(scroll, isResize) {
    super.applyScroll(scroll, isResize)

    if (this.props.resourceStore) {
      this.applyResourceScroll(scroll)
    }

    // avoid updating stickyscroll too often
    if (isResize || this.isStickyScrollDirty) {
      this.isStickyScrollDirty = false
      this.spreadsheetBodyStickyScroller.updateSize()
      this.shiftAxis.updateStickyScrollers()
    }
  }


  computeDateScroll(duration: Duration) {
    return this.shiftAxis.computeDateScroll(duration)
  }


  queryDateScroll() {
    return this.shiftAxis.queryDateScroll()
  }


  applyDateScroll(scroll) {
    this.shiftAxis.applyDateScroll(scroll)
  }


  queryResourceScroll() {
    let { rowComponents, rowNodes } = this
    let scroll = {} as any
    let scrollerTop = this.shiftAxis.layout.bodyScroller.el.getBoundingClientRect().top // fixed position

    for (let i = 0; i < rowComponents.length; i++) {
      let rowComponent = rowComponents[i]
      let rowNode = rowNodes[i]

      let el = rowComponent.timeAxisTr
      let elBottom = el.getBoundingClientRect().bottom // fixed position

      if (elBottom > scrollerTop) {
        scroll.rowId = rowNode.id
        scroll.bottom = elBottom - scrollerTop
        break
      }
    }

    // TODO: what about left scroll state for spreadsheet area?
    return scroll
  }


  applyResourceScroll(scroll) {
    let rowId = scroll.forcedRowId || scroll.rowId

    if (rowId) {
      let rowComponent = this.rowComponentsById[rowId]

      if (rowComponent) {
        let el = rowComponent.timeAxisTr

        if (el) {
          let innerTop = this.shiftAxis.layout.bodyScroller.enhancedScroll.canvas.el.getBoundingClientRect().top
          let rowRect = el.getBoundingClientRect()
          let scrollTop =
            (scroll.forcedRowId ?
              rowRect.top : // just use top edge
              rowRect.bottom - scroll.bottom) - // pixels from bottom edge
            innerTop

          this.shiftAxis.layout.bodyScroller.enhancedScroll.setScrollTop(scrollTop)
          this.spreadsheet.layout.bodyScroller.enhancedScroll.setScrollTop(scrollTop)
        }
      }
    }
  }

  // TODO: scrollToResource


  // Hit System
  // ------------------------------------------------------------------------------------------


  buildPositionCaches() {
    this.shiftAxis.slats.updateSize()
    this.rowPositions.build()
  }


  queryHit(positionLeft: number, positionTop: number): Hit {
    let { rowPositions } = this
    let slats = this.shiftAxis.slats
    let rowIndex = rowPositions.topToIndex(positionTop)

    if (rowIndex != null) {
      let resource = (this.rowNodes[rowIndex] as ResourceNode).resource

      if (resource) { // not a group
        let slatHit = slats.positionToHit(positionLeft)

        if (slatHit) {
          return {
            component: this,
            dateSpan: {
              range: slatHit.dateSpan.range,
              allDay: slatHit.dateSpan.allDay,
              resourceId: resource.id
            },
            rect: {
              left: slatHit.left,
              right: slatHit.right,
              top: rowPositions.tops[rowIndex],
              bottom: rowPositions.bottoms[rowIndex]
            },
            dayEl: slatHit.dayEl,
            layer: 0
          }
        }
      }
    }
  }


  // Resource Area
  // ------------------------------------------------------------------------------------------------------------------


  setResourceAreaWidth(widthVal) {
    this.resourceAreaWidth = widthVal
    applyStyleProp(this.resourceAreaHeadEl, 'width', widthVal || '')
  }


  initResourceAreaWidthDragging() {
    let { calendar, isRtl } = this.context

    let resourceAreaDividerEls = Array.prototype.slice.call(
      this.el.querySelectorAll('.fc-col-resizer')
    )

    let ElementDraggingImpl = calendar.pluginSystem.hooks.elementDraggingImpl

    if (ElementDraggingImpl) {
      this.resourceAreaWidthDraggings = resourceAreaDividerEls.map((el: HTMLElement) => {
        let dragging = new ElementDraggingImpl(el)
        let dragStartWidth
        let viewWidth

        dragging.emitter.on('dragstart', () => {
          dragStartWidth = this.resourceAreaWidth
          if (typeof dragStartWidth !== 'number') {
            dragStartWidth = this.resourceAreaHeadEl.getBoundingClientRect().width
          }
          viewWidth = this.el.getBoundingClientRect().width
        })

        dragging.emitter.on('dragmove', (pev: PointerDragEvent) => {
          let newWidth = dragStartWidth + pev.deltaX * (isRtl ? -1 : 1)
          newWidth = Math.max(newWidth, MIN_RESOURCE_AREA_WIDTH)
          newWidth = Math.min(newWidth, viewWidth - MIN_RESOURCE_AREA_WIDTH)
          this.setResourceAreaWidth(newWidth)
        })

        dragging.setAutoScrollEnabled(false) // because gets weird with auto-scrolling time area

        return dragging
      })
    }
  }

}


function hasResourceBusinessHours(resourceStore: ResourceHash) {
  for (let resourceId in resourceStore) {
    let resource = resourceStore[resourceId]

    if (resource.businessHours) {
      return true
    }
  }

  return false
}


function hasNesting(nodes: (GroupNode | ResourceNode)[]) {
  for (let node of nodes) {
    if ((node as GroupNode).group) {
      return true
    } else if ((node as ResourceNode).resource) {
      if ((node as ResourceNode).hasChildren) {
        return true
      }
    }
  }

  return false
}

// Generates the format string that should be used to generate the title for the current date range.
// Attempts to compute the most appropriate format if not explicitly specified with `titleFormat`.
function computeTitleFormat(dateProfile) {
  let currentRangeUnit = dateProfile.currentRangeUnit

  if (currentRangeUnit === 'year') {
    return { year: 'numeric' }
  } else if (currentRangeUnit === 'month') {
    return { year: 'numeric', month: 'long' } // like "September 2014"
  } else {
    let days = diffWholeDays(
      dateProfile.currentRange.start,
      dateProfile.currentRange.end
    )
    if (days !== null && days > 1) {
      // multi-day range. shorter, like "Sep 9 - 10 2014"
      return { year: 'numeric', month: 'short', day: 'numeric' }
    } else {
      // one day. longer, like "September 9 2014"
      return { year: 'numeric', month: 'long', day: 'numeric' }
    }
  }
}
function getTimezoneOffset(tz, d = new Date()) {
  let a = d.toLocaleString("ja", {timeZone: tz}).split(/[/\s:]/);
  a[1] = (parseInt(a[1]) - 1).toString();
  const t1 = Date.UTC.apply(null, a);
  const t2 = new Date(d).setMilliseconds(0);
  return (t2 - t1) / 60 / 1000;
}