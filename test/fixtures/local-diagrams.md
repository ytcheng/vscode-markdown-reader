# Local diagram fixture

This document checks all bundled diagram renderers, formulas, code, local resources, tables, and links.

## PlantUML sequence

```plantuml
@startuml
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response
@enduml
```

## PlantUML class

```puml
@startuml
class User {
  +name: String
  +login()
}
class Order {
  +id: Integer
}
User "1" --> "*" Order
@enduml
```

## PlantUML component

```plantuml
@startuml
[Client] --> [Service]
@enduml
```

## Graphviz directed

```dot
digraph G {
  A -> B
  B -> C
  C -> A
}
```

## Graphviz left to right

```graphviz
digraph Architecture {
  rankdir=LR
  User -> Web
  Web -> API
  API -> Database
  API -> Redis
}
```

## Mermaid

```mermaid
flowchart LR
  Start["Start"] --> Finish["Finish"]
```

## Invalid PlantUML

```plantuml
@startuml
class Cache { +get() }
@enduml
```

## Invalid DOT

```dot
digraph G { A -> }
```

## Unavailable remote include

```plantuml
@startuml
!include https://example.invalid/missing.puml
Alice -> Bob
@enduml
```

## Other Markdown content

Inline math $x^2 + y^2 = z^2$ and display math:

$$
\frac{a}{b} < c
$$

```typescript
const message: string = "local rendering";
```

![Bundled extension icon](../../assets/markdown-reader-icon.png)

| Renderer | Runs locally |
| --- | --- |
| PlantUML | Yes |
| Graphviz | Yes |

[Back to the top](#local-diagram-fixture) · [Project repository](https://github.com/ytcheng/vscode-markdown-reader)
