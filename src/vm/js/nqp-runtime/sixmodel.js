'use strict';

const JSBI = require('jsbi');
const ZERO = JSBI.BigInt(0);

/* Used when evaling runtime compiled methods */
const nullStr = require('./null_s.js');

const Null = require('./null.js');

const globalContext = require('./global-context.js');

const constants = require('./constants.js');

/* Needed for setting defaults values of attrs for objects */

/* Needed for throwing exceptions from generated code */
const NQPException = require('./nqp-exception.js');

const nativeArgs = require('./native-args.js');
const NativeStrArg = nativeArgs.NativeStrArg;

/*async*/ function findMethod(ctx, obj, name) {
  if (obj.$$STable.methodCache) {
    const method = obj.$$STable.methodCache.get(name);
    if (method !== undefined) {
      return method;
    }
    if (obj.$$STable.modeFlags & constants.METHOD_CACHE_AUTHORITATIVE) {
      return Null;
    }
  }

  if (/*await*/ obj.$$STable.HOW.$$can(ctx, 'find_method')) {
    return /*await*/ obj.$$STable.HOW.p6$find_method(ctx, null, obj.$$STable.HOW, obj, new NativeStrArg(name));
  } else {
    return Null;
  }
}
function scwb() {
  const compilingSCs = globalContext.context.compilingSCs;

  if (compilingSCs.length == 0 || globalContext.context.scwbDisableDepth || globalContext.context.neverRepossess.has(this)) {
    return;
  }

  if (compilingSCs[compilingSCs.length - 1] !== this.$$SC) {
    const owned = this.$$SC.ownedObjects.get(this);
    compilingSCs[compilingSCs.length - 1].repossessObject(owned === undefined ? this : owned);
  }
}

module.exports.scwb = scwb;

class STable {
  constructor(REPR, HOW) {
    this.REPR = REPR;
    this.HOW = HOW;

    this.modeFlags = 0;

    this.lazyMethodCache = false;

    this.$$SC = undefined;

    this.ObjConstructor = REPR.createObjConstructor(this);

    /* HACK - it's a bit hackish - think how correct it is */
    this.ObjConstructor.prototype.$$clone = function() {
      const clone = new this.$$STable.ObjConstructor();
      for (const i in this) {
        if (Object.prototype.hasOwnProperty.call(this, i) && i != '$$SC') {
          clone[i] = this[i];
        }
      }
      return clone;
    };

    /* Default boolification mode 5 */
    this.ObjConstructor.prototype.$$toBool = function(ctx) {
      return this.$$typeObject ? 0 : 1;
    };

    this.ObjConstructor.prototype.$$decont = function(ctx) {
      return this;
    };

    this.ObjConstructor.prototype.$$isrwcont = function() {
      return 0;
    };

    this.ObjConstructor.prototype.$$typeObject = 0;

    this.ObjConstructor.prototype.$$call = undefined;

    this.ObjConstructor.prototype.$$scwb = scwb;
    this.ObjConstructor.prototype.$$istype = /*async*/ function(ctx, type) {
      const cache = this.$$STable.typeCheckCache;
      if (cache) {
        for (let i = 0; i < cache.length; i++) {
          if (cache[i] === type) {
            return 1;
          }
        }
      } else {
        /* If we get here, need to call .^type_check on the value we're
         * checking. */

        const HOW = this.$$STable.HOW;
        /* This "hack" is stolen from the JVM */
        if (!/*await*/ HOW.$$can(ctx, 'type_check')) {
          return 0;
        }

        const typeCheckResult = /*await*/ HOW.p6$type_check(ctx, null, HOW, this, type);
        if (typeof typeCheckResult === 'number' ? typeCheckResult : typeCheckResult.$$toBool(ctx)) {
          return 1;
        }
      }

      const TYPE_CHECK_NEEDS_ACCEPTS = 2;
      if (type.$$STable.modeFlags & TYPE_CHECK_NEEDS_ACCEPTS) {
        return (/*await*/ type.$$STable.HOW.p6$accepts_type(ctx, null, type.$$STable.HOW, type, this)).$$toBool(ctx);
      }

      return 0;
    };

    this.ObjConstructor.prototype.$$can = /*async*/ function(ctx, name) {
      return (/*await*/ findMethod(ctx, this, name)) === Null ? 0 : 1;
    };

    if (this.REPR.setupSTable) {
      this.REPR.setupSTable(this);
    }
  }

  lookupParametric(params) {
    const lookup = this.parameterizerCache;
    for (let i = 0; i < lookup.length; i++) {
      if (params.length == lookup[i].params.length) {
        let match = true;
        for (let j = 0; j < params.length; j++) {
          /* XXX More cases to consider here. - copied over from the jvm backend, need to consider what they are*/
          if (params[j] !== lookup[i].params[j]) {
            match = false;
            break;
          }
        }

        if (match) {
          return lookup[i].type;
        }
      }
    }
  }

  setboolspec(mode, method) {
    this.boolificationSpec = {mode: mode, method: method};
    if (mode == 0) {
      this.ObjConstructor.prototype.$$toBool = /*async*/ function(ctx) {
        const ret = /*await*/ method.$$call(ctx, {}, this);
        return (typeof ret === 'number' ? (ret === 0 ? 0 : 1) : ret.$$decont().$$toBool(ctx));
      };
    } else if (mode == 1) {
      this.ObjConstructor.prototype.$$toBool = function(ctx) {
        return this.$$typeObject || this.$$getInt() == 0 ? 0 : 1;
      };
    } else if (mode == 2) {
      this.ObjConstructor.prototype.$$toBool = function(ctx) {
        return this.$$typeObject || this.$$getNum() == 0 ? 0 : 1;
      };
    } else if (mode == 3) {
      this.ObjConstructor.prototype.$$toBool = function(ctx) {
        return (this.$$typeObject || this.$$getStr() === nullStr || this.$$getStr() === '')  ? 0 : 1;
      };
    } else if (mode == 4) {
      this.ObjConstructor.prototype.$$toBool = function(ctx) {
        if (this.$$typeObject) return 0;
        const str = this.$$getStr();
        return (str === nullStr || str == '' || str == '0') ? 0 : 1;
      };
    } else if (mode == 5) {
    // this is the default - do nothing
    } else if (mode == 6) {
      this.ObjConstructor.prototype.$$toBool = function(ctx) {
        return (this.$$typeObject || JSBI.equal(this.$$getBignum(), ZERO)) ? 0 : 1;
      };
    } else if (mode == 7) {
    // STUB
    } else if (mode == 8) {
      this.ObjConstructor.prototype.$$toBool = function(ctx) {
        return this.$$elems() ? 1 : 0;
      };
    } else {
      throw new NQPException('setboolspec with mode: ' + mode + ' NYI');
    }
  }

  setinvokespec(classHandle, attrName, invocationHandler) {
    if (classHandle !== Null) {
      /* TODO  - think if we can use direct access here */
      const getter = this.REPR.getterForAttr(classHandle, attrName);
      this.ObjConstructor.prototype.$$call = function() {
        const value = this[getter]();
        return value.$$call.apply(value, arguments);
      };
      this.ObjConstructor.prototype.$$apply = function(args) {
        return this[getter]().$$apply(args);
      };
    } else {
      this.ObjConstructor.prototype.$$call = function() {
        const args = [];
        args.push(arguments[0]);
        args.push(arguments[1]);
        args.push(this);
        for (let i = 2; i < arguments.length; i++) {
          args.push(arguments[i]);
        }
        return invocationHandler.$$apply(args);
      };

      this.ObjConstructor.prototype.$$apply = function(args) {
        const newArgs = [];
        newArgs.push(args[0]);
        newArgs.push(args[1]);
        newArgs.push(this);
        for (let i = 2; i < args.length; i++) {
          newArgs.push(args[i]);
        }
        return invocationHandler.$$apply(newArgs);
      };
    }
    this.invocationSpec = {classHandle: classHandle, attrName: attrName, invocationHandler: invocationHandler};
  }


  createTypeObject() {
    const obj = new this.ObjConstructor();
    obj.$$typeObject = 1;
    obj.$$atkey = function(key) {
      return Null;
    };
    obj.$$atpos = function(index) {
      return Null;
    };
    obj.$$decont = function(ctx) {
      return this;
    };
    obj.$$clone = function(ctx) {
      return this;
    };

    obj.$$getInt = function() {
      throw new NQPException(`Cannot unbox a type object (${this.$$STable.debugName}) to an int.`);
    };

    obj.$$getNum = function() {
      throw new NQPException(`Cannot unbox a type object (${this.$$STable.debugName}) to an num.`);
    };

    obj.$$getStr = function() {
      throw new NQPException(`Cannot unbox a type object (${this.$$STable.debugName}) to an str.`);
    };

    obj.$$getattr = function(classHandle, attrName) {
      throw new NQPException(`Cannot look up attributes in a ${this.$$STable.debugName} type object`);
    };

    obj.$$bindattr = function(classHandle, attrName, value) {
      throw new NQPException(`Cannot bind attributes in a ${this.$$STable.debugName} type object`);
    };

    return obj;
  }

  setLazyMethodCache(methodCache) {
    this.methodCache = methodCache;
    this.lazyMethodCache = true;
  }

  setMethodCache(methodCache) {
    // TODO delete old methods

    this.methodCache = methodCache;

    this.lazyMethodCache = false;

    const proto = this.ObjConstructor.prototype;

    methodCache.forEach(function(method, name, map) {
      proto['p6$' + name] = function() {
        return method.$$call.apply(method, arguments);
      };
    });
  }

  setPositionalDelegate(attr) {
    this.ObjConstructor.prototype.$$bindpos = function(index, value) {
      return this[attr].$$bindpos(index, value);
    };

    this.ObjConstructor.prototype.$$atpos = function(index) {
      return this[attr].$$atpos(index);
    };

    this.ObjConstructor.prototype.$$unshift = function(value) {
      return this[attr].$$unshift(value);
    };

    this.ObjConstructor.prototype.$$pop = function(value) {
      return this[attr].$$pop(value);
    };

    this.ObjConstructor.prototype.$$push = function(value) {
      return this[attr].$$push(value);
    };

    this.ObjConstructor.prototype.$$shift = function(value) {
      return this[attr].$$shift(value);
    };

    this.ObjConstructor.prototype.$$elems = function(value) {
      return this[attr].$$elems();
    };
  }

  setAssociativeDelegate(attr) {
    this.ObjConstructor.prototype.$$bindkey = function(key, value) {
      return this[attr].$$bindkey(key, value);
    };
    this.ObjConstructor.prototype.$$atkey = function(key) {
      return this[attr].$$atkey(key);
    };
    this.ObjConstructor.prototype.$$existskey = function(key) {
      return this[attr].$$existskey(key);
    };
    this.ObjConstructor.prototype.$$deletekey = function(key) {
      return this[attr].$$deletekey(key);
    };
  }

  addInternalMethod(name, func) {
    this.ObjConstructor.prototype[name] = func;
  }

  addInternalMethods(klass) {
    for (const methodName of Object.getOwnPropertyNames(klass.prototype)) {
      this.addInternalMethod(methodName, klass.prototype[methodName]);
    }
  }

  addCustomInspection(callback) {
    this.addInternalMethod(Symbol.for('nodejs.util.inspect.custom'), callback);
  }

  compileAccessor(accessor, code, setup) {
    this.code = this.code || '';
    this.setup = this.setup || '';
    if (setup) this.setup += setup;
    this.code += 'STable.addInternalMethod("' + accessor + '",' + code + ');\n';
  }

  evalGatheredCode() {
    if (this.code) {
      const STable = this; // eslint-disable-line no-unused-vars
      eval(this.setup + this.code);
      this.code = '';
    }
  }

  scwb() {
    const compilingSCs = globalContext.context.compilingSCs;

    if (compilingSCs.length == 0 || globalContext.context.scwbDisableDepth) return;
    if (compilingSCs[compilingSCs.length - 1] !== this.$$SC) {
      compilingSCs[compilingSCs.length - 1].repossessSTable(this);
    }
  }
};

module.exports.STable = STable;
module.exports.findMethod = findMethod;
