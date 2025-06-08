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
  = _ name:Identifier _ ":" field:(MatchField / FieldType) _ ","? {
    return [name, field]
  }

MatchField
  =  _ "match" __ discrim:Identifier _ "{" _ cases:MatchCaseList _ "}" _ {
      return { kind: "Match", discriminant: discrim, cases: new Map(cases) };
    }

FieldType
  =  _ base:Identifier _ param:BackingType?  _ {
      if (param) {
        return { kind: "Enum", name: base, base: param.toLowerCase() };
      } else {
        switch (base) {
          case "i8": case "i16": case "i32": case "i64":
          case "f32": case "f64":
            return { kind: base };
          default:
            return  { kind: "Struct", name: base };
        }
      }
    }


MatchCaseList
  = c:MatchCase* { return c; }

MatchCase
  = _ tag:Identifier _ "=>" _ typ:FieldType _ ","? _ { return [tag, typ]; }

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

_  = [ \t\n\r]*    // optional whitespace
__ = [ \t\n\r]+    // required whitespace
