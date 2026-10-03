"""Languages offered in the playground. `id` is the Judge0 CE language id."""

LANGUAGES = {
    "python": {"id": 71, "name": "Python 3", "monaco": "python",
               "template": 'def solution():\n    print("Hello from Kiddoo!")\n\nsolution()'},
    "javascript": {"id": 63, "name": "JavaScript (Node.js)", "monaco": "javascript",
                   "template": 'console.log("Hello from Kiddoo!");'},
    "typescript": {"id": 74, "name": "TypeScript", "monaco": "typescript",
                   "template": 'const message: string = "Hello from Kiddoo!";\nconsole.log(message);'},
    "java": {"id": 62, "name": "Java", "monaco": "java",
             "template": 'public class Main {\n    public static void main(String[] args) {\n'
                         '        System.out.println("Hello from Kiddoo!");\n    }\n}'},
    "c": {"id": 50, "name": "C (GCC)", "monaco": "c",
          "template": '#include <stdio.h>\n\nint main() {\n    printf("Hello from Kiddoo!\\n");\n    return 0;\n}'},
    "cpp": {"id": 54, "name": "C++ (GCC)", "monaco": "cpp",
            "template": '#include <iostream>\nusing namespace std;\n\nint main() {\n'
                        '    cout << "Hello from Kiddoo!" << endl;\n    return 0;\n}'},
    "csharp": {"id": 51, "name": "C# (Mono)", "monaco": "csharp",
               "template": 'using System;\n\nclass Program {\n    static void Main() {\n'
                           '        Console.WriteLine("Hello from Kiddoo!");\n    }\n}'},
    "go": {"id": 60, "name": "Go", "monaco": "go",
           "template": 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello from Kiddoo!")\n}'},
    "rust": {"id": 73, "name": "Rust", "monaco": "rust",
             "template": 'fn main() {\n    println!("Hello from Kiddoo!");\n}'},
    "php": {"id": 68, "name": "PHP", "monaco": "php", "template": '<?php\necho "Hello from Kiddoo!";'},
    "ruby": {"id": 72, "name": "Ruby", "monaco": "ruby", "template": 'puts "Hello from Kiddoo!"'},
}
