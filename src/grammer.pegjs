Start
  = _ defs:DefinitionList _ { return defs; }

DefinitionList
  = def:Definition* { return def; }

Definition
  = StructDefinition / EnumDefinition

StructDefinition
  = _ "struct" __ name:Identifier _ "{" _ fields:FieldList _ "}" {
      return { type: "struct", name, fields };
    }

EnumDefinition
  = _ "enum" __ name:Identifier _ "{" _ entries:EnumEntryList _ "}" {
      return { type: "enum", name, entries };
    }

FieldList
  = f:Field* { return f; }

Field
  = _ name:Identifier _ ":" _ base:Identifier _ param:BackingType? _ ","? _ {
      return param
        ? [name, { kind: param, enum: base }]
        : [name, base];
    }

BackingType
  = "(" _ base:Identifier _ ")" { return base; }

EnumEntryList
  = e:EnumEntry* { return e; }

EnumEntry
  = _ name:Identifier _ "=" _ value:Integer _ ","? _ {
      return [name, parseInt(value, 10)];
    }

Integer
  = [0-9]+ { return text(); }

Identifier
  = [a-zA-Z_][a-zA-Z0-9_]* { return text(); }

_  = [ \t\n\r]*      // optional whitespace
__ = [ \t\n\r]+      // required whitespace
