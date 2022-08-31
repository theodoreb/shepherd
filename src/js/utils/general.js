import { isFunction, isString } from './type-check';
import merge from 'deepmerge';
import {
  computePosition,
  autoUpdate,
  shift,
  arrow,
  limitShift
} from '@floating-ui/dom';

/**
 * Ensure class prefix ends in `-`
 * @param {string} prefix The prefix to prepend to the class names generated by nano-css
 * @return {string} The prefix ending in `-`
 */
export function normalizePrefix(prefix) {
  if (!isString(prefix) || prefix === '') {
    return '';
  }

  return prefix.charAt(prefix.length - 1) !== '-' ? `${prefix}-` : prefix;
}

/**
 * Resolves attachTo options, converting element option value to a qualified HTMLElement.
 * @param {Step} step The step instance
 * @returns {{}|{element, on}}
 * `element` is a qualified HTML Element
 * `on` is a string position value
 */
export function parseAttachTo(step) {
  const options = step.options.attachTo || {};
  const returnOpts = Object.assign({}, options);

  if (isFunction(returnOpts.element)) {
    // Bind the callback to step so that it has access to the object, to enable running additional logic
    returnOpts.element = returnOpts.element.call(step);
  }

  if (isString(returnOpts.element)) {
    // Can't override the element in user opts reference because we can't
    // guarantee that the element will exist in the future.
    try {
      returnOpts.element = document.querySelector(returnOpts.element);
    } catch (e) {
      // TODO
    }
    if (!returnOpts.element) {
      console.error(
        `The element for this Shepherd step was not found ${options.element}`
      );
    }
  }

  return returnOpts;
}

/**
 * Checks if the step should be centered or not. Does not trigger attachTo.element evaluation, making it a pure
 * alternative for the deprecated step.isCentered() method.
 * @param resolvedAttachToOptions
 * @returns {boolean}
 */
export function shouldCenterStep(resolvedAttachToOptions) {
  if (
    resolvedAttachToOptions === undefined ||
    resolvedAttachToOptions === null
  ) {
    return true;
  }

  return !resolvedAttachToOptions.element || !resolvedAttachToOptions.on;
}

/**
 * Determines options for the tooltip and initializes
 * `step.tooltip` as a Popper instance.
 * @param {Step} step The step instance
 */
export function setupTooltip(step) {
  if (step.cleanup) {
    step.cleanup();
  }

  const attachToOptions = step._getResolvedAttachToOptions();

  let target = attachToOptions.element;
  const floatingUIOptions = getFloatingUIOptions(attachToOptions, step);

  if (shouldCenterStep(attachToOptions)) {
    target = document.body;
    const content = step.shepherdElementComponent.getElement();
    content.classList.add('shepherd-centered');
  }

  step.cleanup = autoUpdate(target, step.el, () => {
    // The element might have already been removed by the end of the tour.
    if (!step.el) {
      step.cleanup();
      return;
    }

    setPosition(target, step, floatingUIOptions);
  });

  step.target = attachToOptions.element;

  return floatingUIOptions;
}

export function destroyTooltip(step) {
  if (step.cleanup) {
    step.cleanup();
  }

  step.cleanup = null;
}

/**
 * Create a unique id for steps, tours, modals, etc
 * @return {string}
 */
export function uuid() {
  let d = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c == 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 *
 * @return {Promise<*>}
 */
function setPosition(target, step, floatingUIOptions) {
  return (
    computePosition(target, step.el, floatingUIOptions)
      .then(floatingUIposition(step))
      // Wait before forcing focus.
      .then(
        (step) =>
          new Promise((resolve) => {
            setTimeout(() => resolve(step), 300);
          })
      )
      // Replaces focusAfterRender modifier.
      .then((step) => {
        if (step && step.el) {
          step.el.focus({ preventScroll: true });
        }
      })
  );
}

/**
 *
 * @param step
 * @return {function({x: *, y: *, placement: *, middlewareData: *}): Promise<unknown>}
 */
function floatingUIposition(step) {
  return ({ x, y, placement, middlewareData }) => {
    if (!step.el) {
      return step;
    }

    Object.assign(step.el.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`
    });

    step.el.dataset.popperPlacement = placement;

    placeArrow(step.el, placement, middlewareData);

    return step;
  };
}

/**
 *
 * @param el
 * @param placement
 * @param middlewareData
 */
function placeArrow(el, placement, middlewareData) {
  const arrowEl = el.querySelector('.shepherd-arrow');
  if (arrowEl) {
    const { x: arrowX, y: arrowY } = middlewareData.arrow;

    const staticSide = {
      top: 'bottom',
      right: 'left',
      bottom: 'top',
      left: 'right'
    }[placement.split('-')[0]];

    Object.assign(arrowEl.style, {
      left: arrowX != null ? `${arrowX}px` : '',
      top: arrowY != null ? `${arrowY}px` : '',
      right: '',
      bottom: '',
      [staticSide]: '-35px'
    });
  }
}

/**
 * Gets the `Popper` options from a set of base `attachTo` options
 * @param attachToOptions
 * @param {Step} step The step instance
 * @return {Object}
 * @private
 */
export function getFloatingUIOptions(attachToOptions, step) {
  let options = {
    middleware: [
      shift({
        limiter: limitShift(),
        crossAxis: true
      })
    ],
    strategy: 'absolute'
  };

  if (step.options.arrow && step.el) {
    const arrowEl = step.el.querySelector('.shepherd-arrow');
    if (arrowEl) {
      options.middleware.push(arrow({ element: arrowEl }));
    }
  }

  if (!shouldCenterStep(attachToOptions)) {
    options.placement = attachToOptions.on;
  }

  options = merge(step.options.floatingUIOptions || {}, options);

  return options;
}
