// Serialization stubs
var op = {};
module.exports.op = op;

var reprs = require('./reprs.js');
var sixmodel = require('./sixmodel.js');
var SerializationContext = require('./serialization-context');
var __6MODEL_CORE__ = require('./bootstrap.js').core;
var Hash = require('./hash.js');
var Int64 = require('node-int64');
var CodeRef = require('./code-ref.js');


/** All the loaded serialization contexts using their unique IDs as keys */
var serialization_contexts = SerializationContext.contexts;

module.exports.wval = function(handle, idx) {
  return serialization_contexts[handle].root_objects[idx];
};

op.deserialize = function(blob, sc, sh, code_refs, conflict) {
  var buffer = new Buffer(blob, 'base64');
  sc.code_refs = code_refs;
  var cursor = new BinaryCursor(buffer, 0, sh, sc);

  cursor.deserialize(sc);
};

op.createsc = function(handle) {
  return (serialization_contexts[handle] = new SerializationContext(handle));
};

op.scsetdesc = function(sc, desc) {
  sc.description = desc;
};

/**
  We define a BinaryCursor class so we can read sequential things easily
  @constructor
*/
function BinaryCursor(buffer, offset, sh, sc) {
  this.buffer = buffer;
  this.offset = offset;
  this.sh = sh;
  this.sc = sc;
}

/* Export for unit testing*/
exports.BinaryCursor = BinaryCursor;

/** Clone the cursor */
BinaryCursor.prototype.clone = function() {
  if (!this.sc) {
    console.trace("at", this.sc);
    process.exit();
  }
  return new BinaryCursor(this.buffer, this.offset, this.sh, this.sc);
};


/** Return a copy of a cursor at given offset */
BinaryCursor.prototype.at = function(offset) {
  if (!this.sc) {
    console.trace("at", this.sc);
    process.exit();
  }
  return new BinaryCursor(this.buffer, offset, this.sh, this.sc);
};


/** Read a given element a number of times */
BinaryCursor.prototype.times = function(count, cb) {
  var array = [];
  for (var i = 0; i < count; i++) {
    array.push(cb(this));
  }
  return array;
};

/** Read an array of elements parsed by the callback */
BinaryCursor.prototype.array = function(readElem) {
  var elems = this.I32();
  var array = [];
  for (var i = 0; i < elems; i++) {
    array.push(readElem(this));
  }
  return array;
};

function StubedCodeRef(sc, id) {
  this.sc = sc;
  this.id = id;
}

function SerializedObjRef(sc, id) {
  this.sc = sc;
  this.id = id;
}

/** Read an entry from the objects table */
BinaryCursor.prototype.objectEntry = function(objectsData) {
  return {
    STable: [this.I32(), this.I32()],
    data: this.at(objectsData + this.I32()),
    is_concrete: this.I32()
  };
};

/**  */
BinaryCursor.prototype.objRef = function() {
  return this.sc.deps[this.I32()].root_objects[this.I32()];
};

/** Read a hash of variants */
BinaryCursor.prototype.hashOfVariants = function() {
  var elems = this.I32();
  var hash = new Hash();
  for (var i = 0; i < elems; i++) {
    var str = this.str();
    hash[str] = this.variant();
  }
  return hash;
};

/** Read a int of variable length */
/* TODO - make it work correctly for values bigger than 32bit integers*/
BinaryCursor.prototype.varint = function() {
    var result;
    var first;
    var need;
    var buffer = this.buffer;

    first = buffer.readUInt8(this.offset++);

    if (first & 0x80) {
        return first - 129;
    }

    need = first >> 4;

    // XXX TODO - length checks
    if (!need) {
        // unrolled loop for optimization
        result =
            buffer.readUInt8(this.offset + 0)       |
            buffer.readUInt8(this.offset + 1) << 8  |
            buffer.readUInt8(this.offset + 2) << 16 |
            buffer.readUInt8(this.offset + 3) << 24 |
            buffer.readUInt8(this.offset + 4) << 32 |
            buffer.readUInt8(this.offset + 5) << 40 |
            buffer.readUInt8(this.offset + 6) << 48 |
            buffer.readUInt8(this.offset + 7) << 56;
        this.offset += 8;

        return result;
    }
    // TODO
    throw new Error('Reading a varint with need is NYI');
}

/** Read a variant reference */
BinaryCursor.prototype.variant = function() {
  var type = this.buffer.readInt8(this.offset);
  this.offset += 1;
  switch (type) {
    case 2:
      return this.objRef();
    case 1:
    case 3:
      return null;
    case 4:
      // TODO deserialize bigger integers then can fit into a 32bit number
      return this.varint();
    case 5:
      return this.double();
    case 6:
      return this.str();
    case 7:
      return this.array(function(cursor) {return cursor.variant()});
    case 8:
      return this.array(function(cursor) {return cursor.str()});
      /* TODO varints */
/*    case 9:
      return this.array(function(cursor) {return cursor.I64()});*/
    case 10:
      return this.hashOfVariants(this);
    case 11:
    case 12:
      var scID = this.I32();
      var codeRefID = this.I32();
      var codeRef = this.sc.deps[scID].code_refs[codeRefID];
      if (!codeRef) {
        console.log('missing code ref while deserializing', scID, codeRefID);
        console.log(this.sc.code_refs);
      }
      return codeRef;
    default:
      console.trace('unknown variant');
      throw 'unknown variant: ' + type;
  }

};

/** Read an entry from the STable table */
BinaryCursor.prototype.STable = function(STable) {
  STable.HOW = this.objRef();
  STable.WHAT = this.objRef();
  STable.WHO = this.variant();

  var method_cache = this.variant();

  STable.setMethodCache(method_cache);

  var type_check_cache = [];
  var type_check_cache_len = this.I64();
  for (var i = 0; i < type_check_cache_len; i++) {
    type_check_cache.push(this.variant());
  }
  STable.type_check_cache = type_check_cache;

  STable.mode_flags = this.I64();

  var boolification_flag = this.flag64();
  if (boolification_flag) {
    var boolification_mode = this.I64();
    var boolification_method = this.variant();
    STable.setboolspec(boolification_mode, boolification_method);
  }
  var container_flag = this.flag64();
  if (container_flag) {
    STable.container_class_handle = this.variant();
    STable.container_attr_name = this.str();
    STable.container_hint = this.I64();
    STable.container_fetch_method = this.variant();
  }

  var invocation_spec = this.flag64();
  if (invocation_spec) {
    STable.invocation_class_handle = this.variant();
    STable.invocation_attr_name = this.str();
    STable.invocation_hint = this.I64();
    STable.invocation_handler = this.variant();
  }

  STable.hll_owner = this.str();

  // TODO check for MVM_PARAMETRIC_TYPE mode_flags
  // TODO check for MVM_PARAMETRIC_TYPE mode_flags

  if (STable.REPR.deserialize_repr_data) {
    STable.REPR.deserialize_repr_data(this.clone(),STable);
  }


}

BinaryCursor.prototype.staticCodeRef = function() {
  var scID = this.I32();
  var codeRefID = this.I32();
  var staticCode = this.sc.deps[scID].code_refs[codeRefID];
  if (!staticCode) {
    console.log('Code ref has an invalid static code');
  }
  return staticCode;
}

BinaryCursor.prototype.closureEntry = function() {
  var entry = {};
  entry.staticCode = this.staticCodeRef();
  entry.context = this.I32();
  var hasCodeObj = this.I32();
  if (hasCodeObj) {
    entry.codeObj = this.objRef();
  }
  return entry;
}

BinaryCursor.prototype.contextEntry = function(contextsData) {
  var entry = {};
  entry.staticCode = this.staticCodeRef();
  var data = this.at(contextsData + this.I32());
  entry.outer = this.I32();
  entry.inner = [];
  entry.closures = [];

  var count = data.I64();
  var info = entry.staticCode.staticInfo;

  var lexicals = {};

  for (var i = 0; i < count; i++) {
    var name = data.str();

    if (!info[name]) {
      throw "no static info for: ", name;
    }

    switch (info[name][0]) {
      case 0: // obj
        lexicals[name] = data.variant();
        break;
      case 1: // int
        lexicals[name] = data.I64();
        break;
      case 2: // num
        lexicals[name] = data.double();
        break;
      case 3: // str
        lexicals[name] = data.str();
    }
  }

  entry.lexicals = lexicals;

  return entry;
};

/** Read a whole serialization context */
BinaryCursor.prototype.deserialize = function(sc) {
  // XXX varint encoding is different (there's an NYI bit...see if it's impl'd later on)
  // XXX stable serialization has changed

  // XXX writing/reading refs where !IS_CONCRETE looks different
  // XXX read_discrim
  // XXX deserialize_method_cache_lazy
  // XXX parameterized types
  var version = this.I32();

  this.sc = sc;

  if (version != 14) {
    throw 'Unsupported serialization format version: ' + version;
  }

  var deps_offset = this.I32();
  var deps_number = this.I32();


  var dependencies = this.at(deps_offset).times(deps_number,
      function(cursor) { return [cursor.str(), cursor.str()]; });

  var deps = [sc];
  this.sc.deps = deps;

  for (var i in dependencies) {
    var dep = serialization_contexts[dependencies[i][0]];
    if (!dep) {
      //console.log(Object.keys(serialization_contexts));
      console.log(
          "Missing dependencie, can't find serialization context handle:",
          dependencies[i][0],
          'desc:', dependencies[i][1]);
      process.exit();
    }
    deps.push(dep);
  }


  var STables_offset = this.I32();
  var STables_number = this.I32();
  var STables_data = this.I32();

  var STables = this.at(STables_offset).times(STables_number,
      function(cursor) {
        return [cursor.str(), cursor.at(STables_data + cursor.I32()), cursor.at(STables_data + cursor.I32())];
  });


  var objects_offset = this.I32();
  var objects_number = this.I32();
  var objects_data = this.I32();
  var objects =
      this.at(objects_offset).times(objects_number, function(cursor) {
    return cursor.objectEntry(objects_data);
  });



  /* Stub STables */
  for (var i = 0; i < STables.length; i++) {
    var repr = STables[i][0];
    if (!reprs[repr]) {
      throw 'Unknown REPR: ' + repr;
    }
    var REPR = new reprs[repr]();
    REPR.name = repr;
    var HOW = null; /* We will fill that in later once objects are stubbed */
    sc.root_stables[i] = new sixmodel.STable(REPR, HOW);
    sc.root_stables[i]._SC = sc;
  }

  /* Stub objects */
  for (var i = 0; i < objects.length; i++) {
    var STable_for_obj =
        deps[objects[i].STable[0]].root_stables[objects[i].STable[1]];
    if (!STable_for_obj) {
      console.log('Missing stable',objects[i].STable[0],objects[i].STable[1],deps[objects[i].STable[0]].root_stables);
    }

    objects[i].is_array = objects[i].is_concrete && STable_for_obj.REPR.name == 'VMArray';
    objects[i].array_repr = STable_for_obj.REPR;

    if (objects[i].is_array) {
      sc.root_objects[i] = [];
    } else {
      sc.root_objects[i] = new (STable_for_obj.obj_constructor)();
      sc.root_objects[i]._SC = sc;
    }

    if (!objects[i].is_concrete) {
        // TODO think more about it
        sc.root_objects[i].type_object_ = 1;
    }
  }

  for (var i = 0; i < STables.length; i++) {
    STables[i][1].STable(sc.root_stables[i]);
  }

  var closures_offset = this.I32();
  var closures_number = this.I32();
  var closures =
      this.at(closures_offset).times(closures_number, function(cursor) {
    return cursor.closureEntry();
  });

  var closures_base = sc.code_refs.length
  for (var i=0; i < closures.length; i++) {
    sc.code_refs[closures_base+i] = new CodeRef(closures[i].staticCode.name);
    if (closures[i].codeObj) sc.code_refs[closures_base+i].codeObj = closures[i].codeObj;
    closures[i].index = closures_base+i;
  }

  /* Finish up objects */
  for (var i = 0; i < objects.length; i++) {
    if (objects[i].is_array) {
      var repr = objects[i].array_repr;
      repr.deserialize_array(sc.root_objects[i], objects[i].data);
    } else if (objects[i].is_concrete) {
      var repr = sc.root_objects[i]._STable.REPR;
      if (repr.deserialize_finish) {
        repr.deserialize_finish(sc.root_objects[i], objects[i].data);
      }
    }
  }

  var contexts_offset = this.I32();
  var contexts_number = this.I32();
  var contexts_data = this.I32();
  var contexts =
      this.at(contexts_offset).times(contexts_number, function(cursor) {
    return cursor.contextEntry(contexts_data);
  });

  for (var i = 0; i < contexts.length ; i++) {
    if (contexts[i].outer) contexts[contexts[i].outer-1].inner.push(contexts[i]);
  }
  
  var no_context_closures = [];


  for (var i = 0; i < closures.length ; i++) {
    if (closures[i].context) {
        contexts[closures[i].context-1].closures.push(closures[i]);
    } else {
        no_context_closures.push(closures[i]);
    }
  }

  var code = no_context_closures.map(function(closure) {
      return 'var ' + closure.staticCode.outerCtx + ' = null;\n' +
      'sc.code_refs[' + closure.index + '].block(' + 
        closure.staticCode.closureTemplate +
        ');\n'
    }).join("");

  var data = [];
  for (var i = 0; i < contexts.length ; i++) {
    if (contexts[i].outer == 0) {
      code += this.contextToCode(contexts[i], data) + "\n\n";
    }
  }

  var cuids = [];
  for (var cuid in CodeRef.cuids) {
     mangledCuid = cuid.replace(/\./g, "_");
     cuids.push(mangledCuid + " = CodeRef.cuids[\"" + cuid + "\"]");
  }

  var declareCuids = "var " + cuids.join(",") + ";\n";

  var prelude = "var nqp = require('nqp-runtime');\n"
  if (code) {
    /* TODO reduce accidental poisoning */
    /* TODO make cuids be in scope */
    eval(prelude + declareCuids + code);
  }

  var reposTable = this.I32();
  var numRepos = this.I32();
  var paramInternsData = this.I32();
  var numParamInterns = this.I32();

  if(numParamInterns != 0) {
      // XXX do we need to care?
  }
};

BinaryCursor.prototype.contextToCode = function(context, data) {
  var outer_ctx = 'null'; // TODO
  var caller_ctx = 'null';
  var create_ctx = "var " + context.staticCode.ctx + " = new nqp.Ctx(" + outer_ctx + ", " + caller_ctx + ");\n";
  var set_vars = '';


  var lexicals = [];
  for (var name in context.lexicals) {
      data.push(context.lexicals[name]);
      set_vars += 'var ' + context.staticCode.staticInfo[name][1] + " = data[" + (data.length-1) + "]\n";
      console.l
  }

  return "(function() {\n" +
    create_ctx +
    set_vars +
    context.inner.map(function(inner) {return this.contextToCode(inner, data)}).join("") +
    context.closures.map(function(closure) {
      return 'sc.code_refs[' + closure.index + '].block(' + 
        closure.staticCode.closureTemplate +
        ');\n';
    }).join("") +
    "})();\n";
}

/** Read a 32bit integer */
BinaryCursor.prototype.I32 = function() {
  var ret = this.buffer.readInt32LE(this.offset);
  this.offset += 4;
  return ret;
};


function int64(high, low) {
  return new Int64(high, low).toNumber();
}

/** Read a 64bit integer */
BinaryCursor.prototype.I64 = function() {
  var low = this.buffer.readUInt32LE(this.offset);
  var high = this.buffer.readUInt32LE(this.offset + 4);
  this.offset += 8;
  return int64(high, low);
};


/** Read a 64bit floating point number */
BinaryCursor.prototype.double = function() {
  var ret = this.buffer.readDoubleLE(this.offset);
  this.offset += 8;
  return ret;
};


/** Read a flag stored as a 64bit integer */
BinaryCursor.prototype.flag64 = function() {
  var low = this.buffer.readUInt32LE(this.offset);
  var high = this.buffer.readUInt32LE(this.offset + 4);
  this.offset += 8;
  if (high) {
    console.trace('here');
    throw 'the high part of a flag should be empty , got: ' + high;
  }
  if (low != 0 && low != 1) {
    console.trace('here');
    throw 'the low part of a flag should be 1 or 0, got: ' + low;
  }
  return low;
};

/** Read a String */
BinaryCursor.prototype.str = function() {
  return this.sh[this.I32()];
};

