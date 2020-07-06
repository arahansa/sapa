import BaseHandler from "./BaseHandler";
import Event, { CHECK_SAPARATOR, DOM_EVENT_SAPARATOR, SAPARATOR, NAME_SAPARATOR, CHECK_DOM_EVENT_PATTERN } from "../Event";
import { debounce, throttle, isNotUndefined, isFunction } from "../functions/func";
import Dom from "../Dom";


const scrollBlockingEvents = {
    'touchstart': true,
    'touchmove': true,
    'mousedown': true,
    'mouseup': true,
    'mousemove': true, 
    'wheel': true,
    'mousewheel': true
}

export default class DomEventHandler extends BaseHandler {


    initialize() {
        this.destroy();

        if (!this._domEvents) {
          this._domEvents = this.filterProps(CHECK_DOM_EVENT_PATTERN)
        }
        this._domEvents.forEach(key => this.parseEvent(key));
    }

    destroy() {
        this.removeEventAll();
    }


    removeEventAll() {
        this.getBindings().forEach(obj => {
          this.removeEvent(obj);
        });
        this.initBindings();
    }

    removeEvent({ eventName, dom, callback }) {
        Event.removeEvent(dom, eventName, callback);
    }    

    getBindings() {
        if (!this._bindings) {
          this.initBindings();
        }
    
        return this._bindings;
    }

    addBinding(obj) {
        this.getBindings().push(obj);
    }

    initBindings() {
        this._bindings = [];
    }    


    matchPath (el, selector) {
        if (el) {
          if (el.matches(selector)) {
            return el;
          }
          return this.matchPath(el.parentElement, selector);
        }
        return null;
    }
      
    hasDelegate (e, eventObject) {
        return this.matchPath(e.target || e.srcElement, eventObject.delegate);
    }
      
    makeCallback (eventObject, callback) {
        if (eventObject.delegate) {
          return this.makeDelegateCallback(eventObject, callback);
        } else {
          return this.makeDefaultCallback(eventObject, callback);
        }
    }
      
    makeDefaultCallback (eventObject, callback) {
        return e => {
          var returnValue = this.runEventCallback(e, eventObject, callback);
          if (isNotUndefined(returnValue)) {
            return returnValue;
          }
        };
    }
      
    makeDelegateCallback (eventObject, callback) {
        return e => {
          const delegateTarget = this.hasDelegate(e, eventObject);
      
          if (delegateTarget) {
            // delegate target 이 있는 경우만 callback 실행
            e.$dt = Dom.create(delegateTarget);      
      
            var returnValue = this.runEventCallback(e, eventObject, callback);
            if (isNotUndefined(returnValue)) {
              return returnValue;
            }
          }
        };
    }
      
    runEventCallback (e, eventObject, callback) {
        const context = this.context;
        e.xy = Event.posXY(e);
      
        if (eventObject.beforeMethods.length) {
          eventObject.beforeMethods.every(before => {
            return context[before.target].call(context, e, before.param);
          });
        }
      
        if (this.checkEventType(e, eventObject)) {
          var returnValue = callback(e, e.$dt, e.xy);
      
          if (returnValue !== false && eventObject.afterMethods.length) {
            eventObject.afterMethods.forEach(after =>
              context[after.target].call(context, e, after.param)
            );
          }
      
          return returnValue;
        }
    }
      
    checkEventType (e, eventObject) {
        const context = this.context;
        // 특정 keycode 를 가지고 있는지 체크
        var hasKeyCode = true;
        if (eventObject.codes.length) {
          hasKeyCode =
            (e.code ? eventObject.codes.indexOf(e.code.toLowerCase()) > -1 : false) ||
            (e.key ? eventObject.codes.indexOf(e.key.toLowerCase()) > -1 : false);
        }
      
        // 체크 메소드들은 모든 메소드를 다 적용해야한다.
        var isAllCheck = true;
        if (eventObject.checkMethodList.length) {
          isAllCheck = eventObject.checkMethodList.every(field => {
            var fieldValue = context[field];    
            if (isFunction(fieldValue) && fieldValue) {
              // check method
              return fieldValue.call(context, e);
            } else if (isNotUndefined(fieldValue)) {
      
              // check field value
              return !!fieldValue;
            }
            return true;
          });
        }
      
        return hasKeyCode && isAllCheck;
    }
      
    getDefaultDomElement(dom) {
        const context = this.context;
        let el;
      
        if (dom) {
          el = context.refs[dom] || context[dom] || window[dom];
        } else {
          el = context.el || context.$el || context.$root;
        }
      
        if (el instanceof Dom) {
          return el.getElement();
        }
      
        return el;
    };
      
    getDefaultEventObject (eventName, checkMethodFilters) {
        const context = this.context;
        let arr = checkMethodFilters;
      
        // context 에 속한 변수나 메소드 리스트 체크
        const checkMethodList = arr.filter(code => !!context[code]);
      
        // 이벤트 정의 시점에 적용 되어야 하는 것들은 모두 method() 화 해서 정의한다.
        const [afters, afterMethods] = this.splitMethodByKeyword(arr, "after");
        const [befores, beforeMethods] = this.splitMethodByKeyword(arr, "before");
        const [debounces, debounceMethods] = this.splitMethodByKeyword(arr, "debounce");
        const [throttles, throttleMethods] = this.splitMethodByKeyword(arr, "throttle");
        const [captures] = this.splitMethodByKeyword(arr, "capture");
      
        // 위의 5개 필터 이외에 있는 코드들은 keycode 로 인식한다.
        const filteredList = [
          ...checkMethodList,
          ...afters,
          ...befores,
          ...debounces,
          ...throttles,
          ...captures
        ];
      
        var codes = arr
          .filter(code => filteredList.indexOf(code) === -1)
          .map(code => code.toLowerCase());
      
        return {
          eventName,
          codes,
          captures,
          afterMethods,
          beforeMethods,
          debounceMethods,
          throttleMethods,
          checkMethodList
        };
    }
      
      
    addEvent (eventObject, callback) {
        eventObject.callback = this.makeCallback(eventObject, callback);
        this.addBinding(eventObject);
      
        var options = !!eventObject.captures.length
      
        if (scrollBlockingEvents[eventObject.eventName]) {
          options = {
            passive: true,
            capture: options  
          }
        }
      
        Event.addEvent(
          eventObject.dom,
          eventObject.eventName,
          eventObject.callback,
          options
        );
    }
      
    bindingEvent ( [eventName, dom, ...delegate], checkMethodFilters, callback ) {
        const context = this.context;
        let eventObject = this.getDefaultEventObject(eventName, checkMethodFilters);
      
        eventObject.dom = this.getDefaultDomElement(dom);
        eventObject.delegate = delegate.join(SAPARATOR);
      
        if (eventObject.debounceMethods.length) {
          var debounceTime = +eventObject.debounceMethods[0].target;
          callback = debounce(callback, debounceTime);
        } else if (eventObject.throttleMethods.length) {
          var throttleTime = +eventObject.throttleMethods[0].target;
          callback = throttle(callback, throttleTime);
        }
      
        this.addEvent(eventObject, callback);
      };
      
    getEventNames (eventName) {
        let results = [];
        
        eventName.split(NAME_SAPARATOR).forEach(e => {
            var arr = e.split(NAME_SAPARATOR);
        
            results.push(...arr);
        });
        
        return results;
    }
      
    parseEvent (key) {
        const context = this.context;
        let checkMethodFilters = key.split(CHECK_SAPARATOR).map(it => it.trim());
        
        var prefix = checkMethodFilters.shift()
        var eventSelectorAndBehave = prefix.split(DOM_EVENT_SAPARATOR)[1];
        
        var arr = eventSelectorAndBehave.split(SAPARATOR);
        var eventNames = this.getEventNames(arr[0]);
        var callback = context[key].bind(context);
        
        eventNames.forEach(eventName => {
            arr[0] = eventName
            this.bindingEvent(arr, checkMethodFilters, callback);
        });
    }  
}