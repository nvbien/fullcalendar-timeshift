import{ isInt } from '@fullcalendar/core'
export function calculateAddition(options) {
    const addition ={ ... options['addition']};
    addition['firstShift'] = 0;
    addition['slotDuration'] = 0;
    ['years','months','days','milliseconds'].forEach((val)=>{
      if(!(val in addition)){
        addition[val] = 0;
      }
    })
    if(('hours' in addition) && isInt(addition['hours'])){
      
      if(typeof options['slotDuration'] =='object'){
        const slotDuration = { ... options['slotDuration']};
        if(('hours' in addition) && isInt(addition['hours'])){
            addition['hours'] = addition['firstShift'] = addition['hours'] % slotDuration['hours'];
            addition['slotDuration'] = slotDuration['hours'];
        }
      }
      addition['milliseconds'] += addition['hours'] * 3600000;
      addition['hours'] = 0;
    }
    return addition;
  }