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
  = _ name:Identifier _ ":" field:Type _ ","? {
    return [name, field]
  }

Type 
  = (BasicType / MatchType / EnumType / StructType ) 

BasicType
  = _ kind:("i8" / "i16" / "i32" / "i64" / "f32" / "f64" ) {
    return {kind}
  }

StructType
  =  _ base:Identifier _ {
      return  { kind: "Struct", name: base };  
    }


EnumType
  =  _ base:Identifier _ "(" _ param:Identifier _ ")"  _ {
      return { kind: "Enum", name: base, base: param.toLowerCase() };
    }



MatchType
  =  _ "match" __ discrim:Identifier _ "{" _ cases:MatchCaseList _ "}" _ {
      return { kind: "Match", discriminant: discrim, cases: new Map(cases) };
    }



MatchCaseList
  = c:MatchCase* { return c; }

MatchCase
  = _ tag:Identifier _ "=>" _ typ:Type _ ","? _ { return [tag, typ]; }


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
