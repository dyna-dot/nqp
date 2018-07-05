package org.perl6.nqp.truffle.nodes.expression;
import com.oracle.truffle.api.frame.VirtualFrame;
import com.oracle.truffle.api.nodes.NodeInfo;
import org.perl6.nqp.truffle.nodes.NQPNode;
import org.perl6.nqp.truffle.nodes.NQPNumNode;
import org.perl6.nqp.dsl.Deserializer;

@NodeInfo(shortName = "atan_n")
public final class NQPAtanNumNode extends NQPNumNode {
    @Child private NQPNode argNode;

    @Deserializer
    public NQPAtanNumNode(NQPNode argNode) {
        this.argNode = argNode;
    }

    @Override
    public double executeNum(VirtualFrame frame) {
        return Math.atan(argNode.executeNum(frame));
    }
}
