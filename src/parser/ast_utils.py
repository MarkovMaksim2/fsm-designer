from pyverilog.vparser.ast import *


def find_nodes(node, node_type):
    result = []

    if isinstance(node, node_type):
        result.append(node)

    for c in node.children():
        result.extend(find_nodes(c, node_type))

    return result