# Diagram performance fixture

Five Mermaid, five PlantUML, and five Graphviz diagrams exercise one reader session and two refreshes.

## Mermaid 1

```mermaid
flowchart LR
  A1[Start] --> B1[Validate]
```

## Mermaid 2

```mermaid
flowchart TD
  A2[Read] --> B2[Parse]
```

## Mermaid 3

```mermaid
sequenceDiagram
  Client->>Server: Request
  Server-->>Client: Response
```

## Mermaid 4

```mermaid
stateDiagram-v2
  Idle --> Active
  Active --> Done
```

## Mermaid 5

```mermaid
flowchart LR
  A5[One] --> B5[Two] --> C5[Three]
```

## PlantUML 1

```plantuml
@startuml
Alice -> Bob: One
@enduml
```

## PlantUML 2

```plantuml
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

## PlantUML 3

```plantuml
@startuml
[Client] --> [Service]
@enduml
```

## PlantUML 4

```plantuml
@startuml
User -> API: Read
API --> DB: Query
@enduml
```

## PlantUML 5

```plantuml
@startuml
Worker -> Queue: Publish
Queue --> Worker: Ack
@enduml
```

## Graphviz 1

```dot
digraph P1 { A -> B }
```

## Graphviz 2

```dot
digraph P2 { rankdir=LR; A -> B -> C }
```

## Graphviz 3

```dot
digraph P3 { A -> B; A -> C; B -> D; C -> D }
```

## Graphviz 4

```dot
digraph P4 { rankdir=LR; Source -> Transform -> Output }
```

## Graphviz 5

```dot
digraph P5 { Client -> API -> DB; API -> Cache }
```

## Other rendering work

Inline math $\sqrt{x^2+y^2}$; block math:

$$
\sum_{i=1}^{10} i = 55
$$

```typescript
function pass(value: string): string { return value; }
```

![Bundled extension icon](../../assets/markdown-reader-icon.png)

| Kind | Count |
| --- | ---: |
| Mermaid | 5 |
| PlantUML | 5 |
| Graphviz | 5 |
